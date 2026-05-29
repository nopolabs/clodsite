#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/site-spec.json" ]; then
  echo "Error: ${SITE_DIR}/site-spec.json not found. Run /interview first."
  exit 1
fi

# Parse spec — check site.name before loading credentials
SPEC_PARSE=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('${SITE_DIR}/site-spec.json', 'utf8'));
if (!spec.site || !spec.site.name) {
  process.stderr.write('Error: site.name not set in spec.\n');
  process.exit(1);
}
const slug = spec.site.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+\$/g,'');
console.log(slug);
console.log(spec.meta && spec.meta.deployed_url ? spec.meta.deployed_url : '');
console.log(spec.domain && spec.domain.custom && spec.domain.hostname ? spec.domain.hostname : '');
" 2>&1) || { echo "$SPEC_PARSE" >&2; exit 1; }

PROJECT_SLUG=$(echo "$SPEC_PARSE" | sed -n '1p')
DEPLOYED_URL=$(echo "$SPEC_PARSE" | sed -n '2p')
CUSTOM_HOSTNAME=$(echo "$SPEC_PARSE" | sed -n '3p')

if [ -z "$PROJECT_SLUG" ]; then
  echo "Error: could not compute a valid slug from site.name in spec. Check sites/$(basename "${SITE_DIR}")/site-spec.json." >&2
  exit 1
fi

if [ -z "$DEPLOYED_URL" ]; then
  echo "Warning: No recorded deployment URL — proceeding anyway."
fi

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

  CF_API="https://api.cloudflare.com/client/v4"
  CF_TMP=$(mktemp)
  trap 'rm -f "$CF_TMP"' EXIT

  ZONE_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "${CF_API}/zones?name=${APEX}")

  if [ "$ZONE_HTTP" != "200" ]; then
    echo "Warning: could not look up zone for ${APEX} (HTTP ${ZONE_HTTP}) — remove the DNS record manually."
  else
    ZONE_ID=$(node -e "
const d=JSON.parse(require('fs').readFileSync('${CF_TMP}','utf8'));
console.log(d.result && d.result.length > 0 ? d.result[0].id : '');
    " 2>/dev/null)

    if [ -z "$ZONE_ID" ]; then
      echo "Warning: ${APEX} not found in this account — remove the DNS record manually."
    else
      RECORD_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        "${CF_API}/zones/${ZONE_ID}/dns_records?name=${CUSTOM_HOSTNAME}")

      RECORD_ID=$(node -e "
const d=JSON.parse(require('fs').readFileSync('${CF_TMP}','utf8'));
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
          ERR=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('${CF_TMP}','utf8'));console.log(d.errors&&d.errors[0]?d.errors[0].message:'unknown');}catch(e){console.log('unknown');}" 2>/dev/null)
          echo "Warning: could not delete DNS record for ${CUSTOM_HOSTNAME} (HTTP ${DEL_HTTP}): ${ERR}"
        fi
      fi
    fi
  fi
fi
