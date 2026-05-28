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
" 2>&1) || { echo "$SPEC_PARSE" >&2; exit 1; }

PROJECT_SLUG=$(echo "$SPEC_PARSE" | sed -n '1p')
DEPLOYED_URL=$(echo "$SPEC_PARSE" | sed -n '2p')

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
