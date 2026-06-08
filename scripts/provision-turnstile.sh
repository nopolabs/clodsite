#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

PLAN="${SITE_DIR}/build-plan.yaml"
STATE="${SITE_DIR}/.turnstile-state.json"
FUNCTION="${SITE_DIR}/functions/api/contact.js"
SITEKEY_MARKER="__CLODSITE_TURNSTILE_SITEKEY__"
HOSTNAMES_MARKER="__CLODSITE_TURNSTILE_HOSTNAMES__"
API_BASE="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID:-}"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found."
  exit 1
fi

PLAN_JSON=$(PLAN="$PLAN" node <<'NODE'
const fs = require('fs');
const yaml = require('js-yaml');
const plan = yaml.load(fs.readFileSync(process.env.PLAN, 'utf8'));
let form = null;
for (const page of plan.pages || []) {
  form = (page.components || []).find((component) => component.type === 'resend-form');
  if (form) break;
}
process.stdout.write(JSON.stringify({
  enabled: form && form.turnstile === true,
  slug: plan.slug || '',
  customDomain: plan.custom_domain || '',
}));
NODE
)

TURNSTILE_ENABLED=$(PLAN_JSON="$PLAN_JSON" node -e "
process.stdout.write(JSON.parse(process.env.PLAN_JSON).enabled ? 'true' : 'false');
")
SITE_NAME=$(PLAN_JSON="$PLAN_JSON" node -e "
process.stdout.write(JSON.parse(process.env.PLAN_JSON).slug);
")
CUSTOM_DOMAIN=$(PLAN_JSON="$PLAN_JSON" node -e "
process.stdout.write(JSON.parse(process.env.PLAN_JSON).customDomain);
")
unset PLAN_JSON

if [ "$TURNSTILE_ENABLED" != "true" ]; then
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
if [ ! -d "${SITE_DIR}/dist" ] || [ ! -f "$FUNCTION" ]; then
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
WIDGET_NAME="clodsite:${SITE_NAME}:resend-form"
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
  MATCH=$(RESPONSE="$LIST_RESPONSE" WIDGET_NAME="$WIDGET_NAME" node -e "
const response=JSON.parse(process.env.RESPONSE);
const matches=(response.result || []).filter((widget) => widget.name === process.env.WIDGET_NAME);
if (matches.length > 1) process.stdout.write('ambiguous');
else if (matches.length === 1) process.stdout.write(matches[0].sitekey);
")
  unset LIST_RESPONSE
  if [ "$MATCH" = "ambiguous" ]; then
    echo "Error: multiple Turnstile widgets are named '$WIDGET_NAME'."
    echo "Remove the duplicate widgets or restore ${STATE} with the intended site key."
    exit 1
  fi
  SITEKEY="$MATCH"
fi

WIDGET_PAYLOAD=$(WIDGET_NAME="$WIDGET_NAME" DOMAINS_JSON="$DOMAINS_JSON" node -e "
process.stdout.write(JSON.stringify({
  name: process.env.WIDGET_NAME,
  domains: JSON.parse(process.env.DOMAINS_JSON),
  mode: 'managed',
  clearance_level: 'no_clearance',
}));
")

if [ -z "$SITEKEY" ]; then
  echo "Creating Turnstile widget '$WIDGET_NAME'..."
  DETAIL_RESPONSE=$(api_request POST "${API_BASE}/challenges/widgets" "$WIDGET_PAYLOAD")
else
  echo "Reusing Turnstile widget '$WIDGET_NAME'..."
  DETAIL_RESPONSE=$(api_request GET "${API_BASE}/challenges/widgets/${SITEKEY}")
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
const functionPath = path.join(siteDir, 'functions', 'api', 'contact.js');
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

let functionSource = fs.readFileSync(functionPath, 'utf8');
if (functionSource.includes(hostnamesMarker)) {
  functionSource = functionSource.replace(hostnamesMarker, domainsJson);
} else if (functionSource.includes(domainsJson)) {
  // Already configured for this domain set.
} else if (previousDomainsJson && functionSource.includes(previousDomainsJson)) {
  functionSource = functionSource.replace(previousDomainsJson, domainsJson);
} else {
  console.error('Error: Turnstile hostname marker was not found in contact Function.');
  process.exit(1);
}
fs.writeFileSync(functionPath, functionSource);

const remainingHtml = [];
walkForMarker(path.join(siteDir, 'dist'), remainingHtml);
const remainingFunction = fs.readFileSync(functionPath, 'utf8');
if (remainingHtml.length > 0 || remainingFunction.includes(process.env.HOSTNAMES_MARKER)) {
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
NODE

SITEKEY="$SITEKEY" WIDGET_NAME="$WIDGET_NAME" DOMAINS_JSON="$DOMAINS_JSON" STATE="$STATE" node <<'NODE'
const fs = require('fs');
fs.writeFileSync(process.env.STATE, JSON.stringify({
  sitekey: process.env.SITEKEY,
  widget_name: process.env.WIDGET_NAME,
  domains: JSON.parse(process.env.DOMAINS_JSON),
}, null, 2) + '\n');
NODE

echo "✓ Turnstile provisioned for ${PAGES_DOMAIN}${CUSTOM_DOMAIN:+ and ${CUSTOM_DOMAIN}}."
