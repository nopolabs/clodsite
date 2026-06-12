#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

PLAN="${SITE_DIR}/build-plan.yaml"
STATE="${SITE_DIR}/.turnstile-state.json"
SITEKEY_MARKER="__CLODSITE_TURNSTILE_SITEKEY__"
HOSTNAMES_MARKER="__CLODSITE_TURNSTILE_HOSTNAMES__"
API_BASE="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID:-}"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found."
  exit 1
fi

# Anything in the plan that consumes a widget triggers provisioning: a
# turnstile-protected resend-form, or a proxy with turnstile-guarded routes.
PLAN_VALUES=$(node "${SCRIPT_DIR}/lib/build-plan.mjs" \
  "$PLAN" turnstile-consumers slug custom-domain)
TURNSTILE_NEEDED=$(echo "$PLAN_VALUES" | sed -n '1p')
SITE_NAME=$(echo "$PLAN_VALUES" | sed -n '2p')
CUSTOM_DOMAIN=$(echo "$PLAN_VALUES" | sed -n '3p')

if [ "$TURNSTILE_NEEDED" != "true" ]; then
  exit 0
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Error: Turnstile provisioning requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID."
  exit 1
fi
if [ -z "$SITE_NAME" ]; then
  echo "Error: build-plan.yaml is missing slug."
  exit 1
fi
if [ ! -d "${SITE_DIR}/dist" ] || [ ! -d "${SITE_DIR}/functions" ]; then
  echo "Error: protected site artifacts are missing. Run /build first."
  exit 1
fi

api_request() {
  local method="${1:?method required}"
  local url="${2:?url required}"
  local payload="${3:-}"
  local response

  if [ -n "$payload" ]; then
    if ! response=$(curl --fail-with-body --silent --show-error \
      --request "$method" \
      --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      --header "Content-Type: application/json" \
      --data "$payload" \
      "$url"); then
      echo "Error: Cloudflare Turnstile API request failed." >&2
      echo "Ensure the token has Account > Turnstile > Edit permission." >&2
      return 1
    fi
  else
    if ! response=$(curl --fail-with-body --silent --show-error \
      --request "$method" \
      --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      "$url"); then
      echo "Error: Cloudflare Turnstile API request failed." >&2
      echo "Ensure the token has Account > Turnstile > Edit permission." >&2
      return 1
    fi
  fi

  if ! RESPONSE="$response" node <<'NODE'
const response = JSON.parse(process.env.RESPONSE);
if (response.success !== true) {
  const message = (response.errors || []).map((error) => error.message).filter(Boolean).join('; ');
  if (message) console.error(message);
  process.exit(1);
}
NODE
  then
    echo "Error: Cloudflare API returned an unsuccessful response." >&2
    echo "Ensure the token has Account > Turnstile > Edit permission." >&2
    return 1
  fi

  printf '%s' "$response"
}

PROJECT_RESPONSE=$(api_request GET "${API_BASE}/pages/projects/${SITE_NAME}")
PAGES_DOMAIN=$(RESPONSE="$PROJECT_RESPONSE" node -e "
const response=JSON.parse(process.env.RESPONSE);
process.stdout.write(response.result && response.result.subdomain || '');
")
unset PROJECT_RESPONSE
if [ -z "$PAGES_DOMAIN" ]; then
  echo "Error: Cloudflare Pages project did not return a production subdomain."
  exit 1
fi

DOMAINS_JSON=$(PAGES_DOMAIN="$PAGES_DOMAIN" CUSTOM_DOMAIN="$CUSTOM_DOMAIN" node -e "
const domains=[process.env.PAGES_DOMAIN, process.env.CUSTOM_DOMAIN].filter(Boolean);
process.stdout.write(JSON.stringify([...new Set(domains)].sort()));
")
# One widget per site, shared by every consumer (per-consumer `action`
# strings keep tokens bound to the form that rendered them). New widgets are
# named clodsite:<site>; widgets created before proxies existed carry the
# legacy resend-form suffix and keep their name — no rename churn.
WIDGET_NAME="clodsite:${SITE_NAME}"
LEGACY_WIDGET_NAME="clodsite:${SITE_NAME}:resend-form"
EFFECTIVE_WIDGET_NAME="$WIDGET_NAME"
SITEKEY=""
PREVIOUS_SITEKEY=""
PREVIOUS_DOMAINS_JSON=""

if [ -f "$STATE" ]; then
  PREVIOUS_SITEKEY=$(STATE="$STATE" node -e "
try {
  const state=JSON.parse(require('fs').readFileSync(process.env.STATE,'utf8'));
  process.stdout.write(state.sitekey || '');
} catch {}
")
  PREVIOUS_DOMAINS_JSON=$(STATE="$STATE" node -e "
try {
  const state=JSON.parse(require('fs').readFileSync(process.env.STATE,'utf8'));
  if (Array.isArray(state.domains)) process.stdout.write(JSON.stringify([...state.domains].sort()));
} catch {}
")
  SITEKEY="$PREVIOUS_SITEKEY"
fi

if [ -z "$SITEKEY" ]; then
  LIST_RESPONSE=$(api_request GET "${API_BASE}/challenges/widgets")
  MATCH=$(RESPONSE="$LIST_RESPONSE" WIDGET_NAME="$WIDGET_NAME" \
    LEGACY_WIDGET_NAME="$LEGACY_WIDGET_NAME" node -e "
const response=JSON.parse(process.env.RESPONSE);
const byName=(name) => (response.result || []).filter((widget) => widget.name === name);
let matches=byName(process.env.WIDGET_NAME);
if (matches.length === 0) matches=byName(process.env.LEGACY_WIDGET_NAME);
if (matches.length > 1) process.stdout.write('ambiguous');
else if (matches.length === 1) process.stdout.write(matches[0].sitekey);
")
  unset LIST_RESPONSE
  if [ "$MATCH" = "ambiguous" ]; then
    echo "Error: multiple Turnstile widgets are named '$WIDGET_NAME' (or '$LEGACY_WIDGET_NAME')."
    echo "Remove the duplicate widgets or restore ${STATE} with the intended site key."
    exit 1
  fi
  SITEKEY="$MATCH"
fi

if [ -z "$SITEKEY" ]; then
  WIDGET_PAYLOAD=$(WIDGET_NAME="$WIDGET_NAME" DOMAINS_JSON="$DOMAINS_JSON" node -e "
process.stdout.write(JSON.stringify({
  name: process.env.WIDGET_NAME,
  domains: JSON.parse(process.env.DOMAINS_JSON),
  mode: 'managed',
  clearance_level: 'no_clearance',
}));
")
  echo "Creating Turnstile widget '$WIDGET_NAME'..."
  DETAIL_RESPONSE=$(api_request POST "${API_BASE}/challenges/widgets" "$WIDGET_PAYLOAD")
else
  DETAIL_RESPONSE=$(api_request GET "${API_BASE}/challenges/widgets/${SITEKEY}")
  # Preserve the existing widget's name — updates only reconcile domains,
  # mode, and clearance level.
  EFFECTIVE_WIDGET_NAME=$(RESPONSE="$DETAIL_RESPONSE" node -e "
const result=JSON.parse(process.env.RESPONSE).result || {};
process.stdout.write(result.name || '');
")
  if [ -z "$EFFECTIVE_WIDGET_NAME" ]; then
    EFFECTIVE_WIDGET_NAME="$WIDGET_NAME"
  fi
  echo "Reusing Turnstile widget '$EFFECTIVE_WIDGET_NAME'..."
  WIDGET_PAYLOAD=$(WIDGET_NAME="$EFFECTIVE_WIDGET_NAME" DOMAINS_JSON="$DOMAINS_JSON" node -e "
process.stdout.write(JSON.stringify({
  name: process.env.WIDGET_NAME,
  domains: JSON.parse(process.env.DOMAINS_JSON),
  mode: 'managed',
  clearance_level: 'no_clearance',
}));
")
  NEEDS_UPDATE=$(RESPONSE="$DETAIL_RESPONSE" WIDGET_PAYLOAD="$WIDGET_PAYLOAD" node -e "
const widget=JSON.parse(process.env.RESPONSE).result;
const desired=JSON.parse(process.env.WIDGET_PAYLOAD);
const actualDomains=[...(widget.domains || [])].sort();
const desiredDomains=[...desired.domains].sort();
process.stdout.write(
  widget.name !== desired.name ||
  widget.mode !== desired.mode ||
  widget.clearance_level !== desired.clearance_level ||
  JSON.stringify(actualDomains) !== JSON.stringify(desiredDomains)
    ? 'true'
    : 'false'
);
")
  if [ "$NEEDS_UPDATE" = "true" ]; then
    echo "Updating Turnstile widget domains..."
    DETAIL_RESPONSE=$(api_request PUT "${API_BASE}/challenges/widgets/${SITEKEY}" "$WIDGET_PAYLOAD")
  fi
fi

SITEKEY=$(RESPONSE="$DETAIL_RESPONSE" node -e "
const result=JSON.parse(process.env.RESPONSE).result || {};
process.stdout.write(result.sitekey || '');
")
TURNSTILE_SECRET=$(RESPONSE="$DETAIL_RESPONSE" node -e "
const result=JSON.parse(process.env.RESPONSE).result || {};
process.stdout.write(result.secret || '');
")
unset DETAIL_RESPONSE

if [ -z "$SITEKEY" ] || [ -z "$TURNSTILE_SECRET" ]; then
  echo "Error: Cloudflare did not return the Turnstile site key and secret."
  exit 1
fi

echo "Setting TURNSTILE_SECRET_KEY secret for '$SITE_NAME'..."
if ! (cd "$SITE_DIR" && printf '%s' "$TURNSTILE_SECRET" |
  wrangler pages secret put TURNSTILE_SECRET_KEY --project-name "$SITE_NAME"); then
  unset TURNSTILE_SECRET
  echo "Error: failed to set TURNSTILE_SECRET_KEY Pages secret."
  exit 1
fi
unset TURNSTILE_SECRET

SITE_DIR="$SITE_DIR" SITEKEY="$SITEKEY" PREVIOUS_SITEKEY="$PREVIOUS_SITEKEY" \
DOMAINS_JSON="$DOMAINS_JSON" PREVIOUS_DOMAINS_JSON="$PREVIOUS_DOMAINS_JSON" \
SITEKEY_MARKER="$SITEKEY_MARKER" HOSTNAMES_MARKER="$HOSTNAMES_MARKER" node <<'NODE'
const fs = require('fs');
const path = require('path');

const siteDir = process.env.SITE_DIR;
const sitekeyMarker = process.env.SITEKEY_MARKER;
const hostnamesMarker = JSON.stringify(process.env.HOSTNAMES_MARKER);
const sitekey = process.env.SITEKEY;
const previousSitekey = process.env.PREVIOUS_SITEKEY;
const domainsJson = process.env.DOMAINS_JSON;
const previousDomainsJson = process.env.PREVIOUS_DOMAINS_JSON;
const functionsDir = path.join(siteDir, 'functions');
let configuredHtml = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const source = fs.readFileSync(fullPath, 'utf8');
      const count = source.split(sitekeyMarker).length - 1;
      if (count > 0) {
        fs.writeFileSync(fullPath, source.split(sitekeyMarker).join(sitekey));
        configuredHtml += count;
      } else if (source.includes(sitekey)) {
        configuredHtml += 1;
      } else if (previousSitekey && source.includes(previousSitekey)) {
        fs.writeFileSync(fullPath, source.split(previousSitekey).join(sitekey));
        configuredHtml += 1;
      }
    }
  }
}

walk(path.join(siteDir, 'dist'));
if (configuredHtml === 0) {
  console.error('Error: Turnstile site-key marker was not found in built HTML.');
  process.exit(1);
}

// Every turnstile-consuming Function carries the hostname marker (the
// contact form and/or proxy functions with turnstile routes). Patch them
// all; a deploy that provisions a widget no Function consumes is an error.
let configuredFunctions = 0;
function walkFunctions(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFunctions(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const source = fs.readFileSync(fullPath, 'utf8');
      if (source.includes(hostnamesMarker)) {
        fs.writeFileSync(fullPath, source.split(hostnamesMarker).join(domainsJson));
        configuredFunctions += 1;
      } else if (source.includes(domainsJson)) {
        // Already configured for this domain set.
        configuredFunctions += 1;
      } else if (previousDomainsJson && source.includes(previousDomainsJson)) {
        fs.writeFileSync(fullPath, source.split(previousDomainsJson).join(domainsJson));
        configuredFunctions += 1;
      }
    }
  }
}

walkFunctions(functionsDir);
if (configuredFunctions === 0) {
  console.error('Error: Turnstile hostname marker was not found in any Function.');
  process.exit(1);
}

const remainingHtml = [];
walkForMarker(path.join(siteDir, 'dist'), remainingHtml);
const remainingFunctions = [];
walkForFunctionMarker(functionsDir, remainingFunctions);
if (remainingHtml.length > 0 || remainingFunctions.length > 0) {
  console.error('Error: unresolved Turnstile deployment marker remains.');
  process.exit(1);
}

function walkForMarker(dir, found) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkForMarker(fullPath, found);
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      if (fs.readFileSync(fullPath, 'utf8').includes(sitekeyMarker)) found.push(fullPath);
    }
  }
}

function walkForFunctionMarker(dir, found) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkForFunctionMarker(fullPath, found);
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      if (fs.readFileSync(fullPath, 'utf8').includes(process.env.HOSTNAMES_MARKER)) found.push(fullPath);
    }
  }
}
NODE

SITEKEY="$SITEKEY" WIDGET_NAME="$EFFECTIVE_WIDGET_NAME" DOMAINS_JSON="$DOMAINS_JSON" STATE="$STATE" node <<'NODE'
const fs = require('fs');
fs.writeFileSync(process.env.STATE, JSON.stringify({
  sitekey: process.env.SITEKEY,
  widget_name: process.env.WIDGET_NAME,
  domains: JSON.parse(process.env.DOMAINS_JSON),
}, null, 2) + '\n');
NODE

echo "✓ Turnstile provisioned for ${PAGES_DOMAIN}${CUSTOM_DOMAIN:+ and ${CUSTOM_DOMAIN}}."
