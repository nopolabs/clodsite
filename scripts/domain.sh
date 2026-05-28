#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/site-spec.json" ]; then
  echo "Error: ${SITE_DIR}/site-spec.json not found. Run /interview first."
  exit 1
fi

# Parse spec — check deployed_url before loading credentials
SPEC_PARSE=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('${SITE_DIR}/site-spec.json', 'utf8'));
if (!spec.meta || !spec.meta.deployed_url) {
  process.stderr.write('Error: site has not been deployed yet. Run /deploy first.\n');
  process.exit(1);
}
if (!spec.domain || !spec.domain.hostname) {
  process.stderr.write('Error: domain.hostname not set in spec.\n');
  process.exit(1);
}
const url = new URL(spec.meta.deployed_url);
const slug = spec.site.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+\$/g,'');
console.log(spec.domain.hostname);
console.log(url.hostname);
console.log(slug);
" 2>&1) || { echo "$SPEC_PARSE" >&2; exit 1; }

HOSTNAME=$(echo "$SPEC_PARSE" | sed -n '1p')
PAGES_DEV_HOST=$(echo "$SPEC_PARSE" | sed -n '2p')
PROJECT_SLUG=$(echo "$SPEC_PARSE" | sed -n '3p')

# Extract apex domain (last two labels)
extract_apex() { echo "$1" | rev | cut -d. -f1,2 | rev; }
APEX=$(extract_apex "$HOSTNAME")

# Subdomain label for DNS record (@ for root domain)
if [ "$HOSTNAME" = "$APEX" ]; then
  CNAME_NAME="@"
else
  CNAME_NAME="${HOSTNAME%.$APEX}"
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

CF_API="https://api.cloudflare.com/client/v4"
CF_TMP=$(mktemp)
trap 'rm -f "$CF_TMP"' EXIT

# Step 1: Check zone ownership
ZONE_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "${CF_API}/zones?name=${APEX}")

CLOUDFLARE_DNS=false
ZONE_ID=""

if [ "$ZONE_HTTP" = "200" ]; then
  ZONE_ID=$(node -e "
const d=JSON.parse(require('fs').readFileSync('$CF_TMP','utf8'));
console.log(d.result && d.result.length > 0 ? d.result[0].id : '');
  " 2>/dev/null || echo "")
  [ -n "$ZONE_ID" ] && CLOUDFLARE_DNS=true
elif [ "$ZONE_HTTP" = "403" ]; then
  echo "Warning: token lacks Zone:Read — cannot check DNS ownership."
fi

# Step 2: Add Pages domain association
echo "Adding Pages domain association for ${HOSTNAME}..."
PAGES_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" -X POST \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${HOSTNAME}\"}" \
  "${CF_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_SLUG}/domains")

if [ "$PAGES_HTTP" = "200" ] || [ "$PAGES_HTTP" = "201" ]; then
  echo "✓ Pages domain association added"
elif [ "$PAGES_HTTP" = "409" ]; then
  echo "✓ Pages domain association already configured"
else
  echo "Error adding Pages domain association (HTTP ${PAGES_HTTP}):"
  cat "$CF_TMP"
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
  elif node -e "
const d=JSON.parse(require('fs').readFileSync('$CF_TMP','utf8'));
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
    echo "Error creating DNS record (HTTP ${DNS_HTTP}):"
    cat "$CF_TMP"
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
