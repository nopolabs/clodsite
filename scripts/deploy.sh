#!/usr/bin/env bash
# Note: not using set -e here — we capture wrangler exit code manually

set -uo pipefail

MODE="${1:-}"

# ── --local: serve locally, no Cloudflare token needed ───────────────────────
# eleventy --serve does its own build on startup and watches for changes.
if [ "$MODE" = "--local" ]; then
  echo "Starting local dev server at http://localhost:8080 (Ctrl-C to stop)..."
  echo ""
  cd scaffold && exec npm run serve
fi

# ── Cloudflare Pages deploy ──────────────────────────────────────────────────

# Check .env
if [ ! -f ".env" ]; then
  echo "Error: .env not found. Run /setup first."
  exit 1
fi

# shellcheck source=/dev/null
source .env

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN not set in .env. Run /setup first."
  exit 1
fi

# Check site/site-spec.json
if [ ! -f "site/site-spec.json" ]; then
  echo "Error: site/site-spec.json not found. Run /interview first."
  exit 1
fi

# Check site/dist/
if [ ! -d "site/dist" ] || [ -z "$(ls -A site/dist 2>/dev/null)" ]; then
  echo "Error: site/dist/ is empty or missing. Run /build first."
  exit 1
fi

# Derive project name: site.name → lowercase, spaces/special chars → hyphens
SITE_NAME=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('site/site-spec.json', 'utf8'));
const slug = spec.site.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
console.log(slug);
")

echo "Deploying '$SITE_NAME' to Cloudflare Pages..."
echo ""

mkdir -p scripts

CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
  wrangler pages deploy site/dist --project-name "$SITE_NAME" \
  > scripts/.deploy-output 2> scripts/.deploy-error
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > scripts/.deploy-exit
exit $WRANGLER_EXIT
