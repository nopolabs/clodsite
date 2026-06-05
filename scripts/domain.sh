#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
PLAN="${SITE_DIR}/build-plan.yaml"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Create build-plan.yaml first."
  exit 1
fi

# Parse build-plan.yaml before loading credentials so missing domain config fails fast.
PLAN_PARSE=$(node -e "
const yaml = require('js-yaml');
const fs = require('fs');
const plan = yaml.load(fs.readFileSync('$PLAN', 'utf8'));
if (!plan.slug) {
  process.stderr.write('Error: slug not set in build-plan.yaml.\n');
  process.exit(1);
}
const hostname = String(plan.custom_domain || '').trim();
if (!hostname) {
  process.stderr.write('Error: custom_domain not set in build-plan.yaml.\n');
  process.exit(1);
}
if (/^https?:\/\//i.test(hostname) || hostname.includes('/')) {
  process.stderr.write('Error: custom_domain must be a hostname only, e.g. www.example.com.\n');
  process.exit(1);
}
console.log(plan.slug);
console.log(hostname);
" 2>&1) || { echo "$PLAN_PARSE" >&2; exit 1; }

PROJECT_SLUG=$(echo "$PLAN_PARSE" | sed -n '1p')
HOSTNAME=$(echo "$PLAN_PARSE" | sed -n '2p')

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

# Read the deployed Pages URL from account-scoped Cloudflare state.
PROJECT_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "${CF_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_SLUG}")

if [ "$PROJECT_HTTP" = "404" ]; then
  echo "Error: Cloudflare Pages project not found for slug: ${PROJECT_SLUG}. Run /deploy first."
  exit 1
elif [ "$PROJECT_HTTP" != "200" ]; then
  ERR_MSG=$(CF_TMP_PATH="$CF_TMP" node -e "try{const d=JSON.parse(require('fs').readFileSync(process.env.CF_TMP_PATH,'utf8'));console.log(d.errors&&d.errors[0]?d.errors[0].message:'unknown');}catch(e){console.log('(could not parse response)');}" 2>/dev/null)
  echo "Error reading Cloudflare Pages project (HTTP ${PROJECT_HTTP}): ${ERR_MSG}"
  exit 1
fi

PAGES_DEV_HOST=$(CF_TMP_PATH="$CF_TMP" node -e "
const d = JSON.parse(require('fs').readFileSync(process.env.CF_TMP_PATH, 'utf8'));
const subdomain = d.result && d.result.subdomain ? String(d.result.subdomain) : '';
if (!subdomain) {
  process.stderr.write('Error: no pages.dev subdomain found for Cloudflare Pages project: ${PROJECT_SLUG}.\n');
  process.exit(1);
}
console.log(subdomain.endsWith('.pages.dev') ? subdomain : subdomain + '.pages.dev');
" 2>&1) || { echo "$PAGES_DEV_HOST" >&2; exit 1; }
DEPLOYED_URL="https://${PAGES_DEV_HOST}"

# Extracts the apex domain (last two labels). Note: two-label TLDs like co.uk
# are not handled — for those the zone lookup returns empty and the manual
# DNS fallback is used, which is safe.
extract_apex() { echo "$1" | rev | cut -d. -f1,2 | rev; }
APEX=$(extract_apex "$HOSTNAME")

# Subdomain label for DNS record (@ for root domain)
if [ "$HOSTNAME" = "$APEX" ]; then
  CNAME_NAME="@"
else
  CNAME_NAME="${HOSTNAME%.$APEX}"
fi

# Step 1: Check zone ownership
ZONE_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "${CF_API}/zones?name=${APEX}")

CLOUDFLARE_DNS=false
ZONE_ID=""

if [ "$ZONE_HTTP" = "200" ]; then
  ZONE_ID=$(CF_TMP_PATH="$CF_TMP" node -e "
const d=JSON.parse(require('fs').readFileSync(process.env.CF_TMP_PATH,'utf8'));
console.log(d.result && d.result.length > 0 ? d.result[0].id : '');
  " 2>&1) || { echo "Warning: could not parse zone response — skipping DNS automation." >&2; ZONE_ID=""; }
  [ -n "$ZONE_ID" ] && CLOUDFLARE_DNS=true
elif [ "$ZONE_HTTP" = "403" ]; then
  echo "Warning: token lacks Zone:Read — cannot check DNS ownership."
fi

# Step 2: Add Pages domain association
echo "Adding Pages domain association for ${HOSTNAME}..."
echo "Pages project: ${PROJECT_SLUG}"
echo "Production URL: ${DEPLOYED_URL}"
PAGES_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" -X POST \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${HOSTNAME}\"}" \
  "${CF_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_SLUG}/domains")

PAGES_BODY=$(cat "$CF_TMP")
if [ "$PAGES_HTTP" = "200" ] || [ "$PAGES_HTTP" = "201" ]; then
  echo "✓ Pages domain association added"
elif [ "$PAGES_HTTP" = "409" ] || ([ "$PAGES_HTTP" = "400" ] && echo "$PAGES_BODY" | grep -qi "already added"); then
  echo "✓ Pages domain association already configured"
else
  ERR_MSG=$(CF_TMP_PATH="$CF_TMP" node -e "try{const d=JSON.parse(require('fs').readFileSync(process.env.CF_TMP_PATH,'utf8'));console.log(d.errors&&d.errors[0]?d.errors[0].message:'unknown');}catch(e){console.log('(could not parse response)');}" 2>/dev/null)
  echo "Error adding Pages domain association (HTTP ${PAGES_HTTP}): ${ERR_MSG}"
  exit 1
fi

# Step 3: Create CNAME or print manual instructions
DNS_MANUAL=false

if [ "$CLOUDFLARE_DNS" = true ]; then
  DNS_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"CNAME\",\"name\":\"${CNAME_NAME}\",\"content\":\"${PAGES_DEV_HOST}\",\"proxied\":true}" \
    "${CF_API}/zones/${ZONE_ID}/dns_records")

  if [ "$DNS_HTTP" = "200" ] || [ "$DNS_HTTP" = "201" ]; then
    echo "✓ CNAME created: ${HOSTNAME} → ${PAGES_DEV_HOST} (proxied)"
    echo "SSL certificate will provision within ~1 minute."
    exit 0
  elif CF_TMP_PATH="$CF_TMP" node -e "
const d=JSON.parse(require('fs').readFileSync(process.env.CF_TMP_PATH,'utf8'));
process.exit(d.errors && d.errors.some(e=>e.code===81053) ? 0 : 1);
  " 2>/dev/null; then
    echo "✓ CNAME already exists: ${HOSTNAME} → ${PAGES_DEV_HOST}"
    echo "SSL certificate will provision within ~1 minute."
    exit 0
  elif [ "$DNS_HTTP" = "403" ]; then
    echo ""
    echo "Warning: token lacks Zone:DNS:Edit — cannot create CNAME automatically."
    DNS_MANUAL=true
  else
    ERR_MSG=$(CF_TMP_PATH="$CF_TMP" node -e "try{const d=JSON.parse(require('fs').readFileSync(process.env.CF_TMP_PATH,'utf8'));console.log(d.errors&&d.errors[0]?d.errors[0].message:'unknown');}catch(e){console.log('(could not parse response)');}" 2>/dev/null)
    echo "Error creating DNS record (HTTP ${DNS_HTTP}): ${ERR_MSG}"
    exit 1
  fi
else
  DNS_MANUAL=true
fi

# Manual fallback
echo ""
echo "Add this record at your DNS provider (or Cloudflare DNS dashboard):"
echo "  Type:   CNAME"
echo "  Name:   ${CNAME_NAME}"
echo "  Target: ${PAGES_DEV_HOST}"
echo "  Proxy:  enable if your provider supports it (orange cloud in Cloudflare)"
if [ "$DNS_MANUAL" = true ] && [ "$CLOUDFLARE_DNS" = true ]; then
  echo ""
  echo "To enable full automation: add Zone > DNS: Edit to your token at"
  echo "dash.cloudflare.com → API Tokens, then re-run /domain $(basename "${SITE_DIR}")."
fi
