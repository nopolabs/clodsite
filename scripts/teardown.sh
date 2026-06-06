#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir
PLAN="${SITE_DIR}/build-plan.yaml"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Create build-plan.yaml first."
  exit 1
fi

# Parse build-plan.yaml before loading credentials so plan errors fail fast.
PLAN_PARSE=$(node -e "
const yaml = require('js-yaml');
const fs = require('fs');
const plan = yaml.load(fs.readFileSync('$PLAN', 'utf8'));
if (!plan.slug) {
  process.stderr.write('Error: slug not set in build-plan.yaml.\n');
  process.exit(1);
}
const hostname = String(plan.custom_domain || '').trim();
if (hostname && (/^https?:\/\//i.test(hostname) || hostname.includes('/'))) {
  process.stderr.write('Error: custom_domain must be a hostname only, e.g. www.example.com.\n');
  process.exit(1);
}
console.log(plan.slug);
console.log(hostname);
" 2>&1) || { echo "$PLAN_PARSE" >&2; exit 1; }

PROJECT_SLUG=$(echo "$PLAN_PARSE" | sed -n '1p')
CUSTOM_HOSTNAME=$(echo "$PLAN_PARSE" | sed -n '2p')

# Load credentials
if [ ! -f ".env" ]; then
  echo "Error: .env not found. Run /setup first."
  exit 1
fi
set -a; source .env; set +a

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set in .env. Run /setup first."
  exit 1
fi

CF_TMP=$(mktemp)
trap 'rm -f "$CF_TMP"' EXIT

CF_API="https://api.cloudflare.com/client/v4"

# Read the deployed Pages URL from account-scoped Cloudflare state before deleting.
PROJECT_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "${CF_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_SLUG}")

if [ "$PROJECT_HTTP" = "404" ]; then
  echo "Error: Cloudflare Pages project not found for slug: ${PROJECT_SLUG}. It may already be deleted."
  exit 1
elif [ "$PROJECT_HTTP" != "200" ]; then
  ERR_MSG=$(CF_TMP_PATH="$CF_TMP" node -e "try{const d=JSON.parse(require('fs').readFileSync(process.env.CF_TMP_PATH,'utf8'));console.log(d.errors&&d.errors[0]?d.errors[0].message:'unknown');}catch(e){console.log('(could not parse response)');}" 2>/dev/null)
  echo "Error reading Cloudflare Pages project (HTTP ${PROJECT_HTTP}): ${ERR_MSG}"
  exit 1
fi

DEPLOYED_URL=$(CF_TMP_PATH="$CF_TMP" node -e "
const d = JSON.parse(require('fs').readFileSync(process.env.CF_TMP_PATH, 'utf8'));
const subdomain = d.result && d.result.subdomain ? String(d.result.subdomain) : '';
if (!subdomain) process.exit(0);
const host = subdomain.endsWith('.pages.dev') ? subdomain : subdomain + '.pages.dev';
console.log('https://' + host);
" 2>/dev/null)
if [ -n "$DEPLOYED_URL" ]; then
  echo "Live URL from Cloudflare: ${DEPLOYED_URL}"
else
  echo "Warning: no pages.dev domain found for Cloudflare Pages project '${PROJECT_SLUG}'."
fi

# Delete the Pages project
WRANGLER_OUT=$(wrangler pages project delete "$PROJECT_SLUG" --yes 2>&1) || {
  echo "$WRANGLER_OUT"
  exit 1
}
echo "$WRANGLER_OUT"
echo "✓ Deleted Pages project '${PROJECT_SLUG}'. The live site and all deployment history are gone."

# Delete the custom domain's CNAME record if one was configured
if [ -n "$CUSTOM_HOSTNAME" ]; then
  echo ""
  echo "Cleaning up DNS record for ${CUSTOM_HOSTNAME}..."

  extract_apex() { echo "$1" | rev | cut -d. -f1,2 | rev; }
  APEX=$(extract_apex "$CUSTOM_HOSTNAME")

  ZONE_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "${CF_API}/zones?name=${APEX}")

  if [ "$ZONE_HTTP" != "200" ]; then
    echo "Warning: could not look up zone for ${APEX} (HTTP ${ZONE_HTTP}) — remove the DNS record manually."
  else
    ZONE_ID=$(CF_TMP_PATH="$CF_TMP" node -e "
const d=JSON.parse(require('fs').readFileSync(process.env.CF_TMP_PATH,'utf8'));
console.log(d.result && d.result.length > 0 ? d.result[0].id : '');
    " 2>/dev/null)

    if [ -z "$ZONE_ID" ]; then
      echo "Warning: ${APEX} not found in this account — remove the DNS record manually."
    else
      RECORD_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        "${CF_API}/zones/${ZONE_ID}/dns_records?name=${CUSTOM_HOSTNAME}")

      RECORD_ID=$(CF_TMP_PATH="$CF_TMP" node -e "
const d=JSON.parse(require('fs').readFileSync(process.env.CF_TMP_PATH,'utf8'));
console.log(d.result && d.result.length > 0 ? d.result[0].id : '');
      " 2>/dev/null)

      if [ -z "$RECORD_ID" ]; then
        echo "✓ No DNS record found for ${CUSTOM_HOSTNAME} — nothing to delete."
      else
        DEL_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" -X DELETE \
          -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
          "${CF_API}/zones/${ZONE_ID}/dns_records/${RECORD_ID}")
        if [ "$DEL_HTTP" = "200" ]; then
          echo "✓ Deleted CNAME record: ${CUSTOM_HOSTNAME}"
        else
          ERR=$(CF_TMP_PATH="$CF_TMP" node -e "try{const d=JSON.parse(require('fs').readFileSync(process.env.CF_TMP_PATH,'utf8'));console.log(d.errors&&d.errors[0]?d.errors[0].message:'unknown');}catch(e){console.log('unknown');}" 2>/dev/null)
          echo "Warning: could not delete DNS record for ${CUSTOM_HOSTNAME} (HTTP ${DEL_HTTP}): ${ERR}"
        fi
      fi
    fi
  fi
fi
