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

# Export every variable from .env so wrangler subprocesses inherit them.
# `source .env` alone makes them shell variables but not env vars; without
# the export, CLOUDFLARE_ACCOUNT_ID never reaches wrangler and any pages
# command runs without account scope.
set -a
# shellcheck source=/dev/null
source .env
set +a

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN not set in .env. Run /setup first."
  exit 1
fi
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Error: CLOUDFLARE_ACCOUNT_ID not set in .env. Run /setup first."
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

# Ensure the Cloudflare Pages project exists in *this* account.
#
# wrangler v4 requires the project to exist before `pages deploy` — it will not
# auto-create it. We deliberately do NOT pre-check with `wrangler pages project
# list`: that list can span every account the token can see, so a project with
# the same slug in a different account causes a false-positive "exists" — and
# then the deploy (scoped to CLOUDFLARE_ACCOUNT_ID) fails with "Project not
# found." Instead we always attempt create and tolerate "already exists."
echo "Ensuring Pages project '$SITE_NAME' exists in account $CLOUDFLARE_ACCOUNT_ID..."
CREATE_OUT=$(wrangler pages project create "$SITE_NAME" --production-branch main 2>&1)
CREATE_EXIT=$?
if [ "$CREATE_EXIT" -eq 0 ]; then
  echo "✓ Project created."
elif echo "$CREATE_OUT" | grep -qi "already exists\|already taken"; then
  echo "✓ Project already exists in this account."
else
  echo "Error: could not create Pages project '$SITE_NAME'."
  echo "$CREATE_OUT"
  exit 1
fi
echo ""

echo "Deploying '$SITE_NAME' to Cloudflare Pages..."
echo ""

mkdir -p scripts

wrangler pages deploy site/dist --project-name "$SITE_NAME" \
  > scripts/.deploy-output 2> scripts/.deploy-error
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > scripts/.deploy-exit
exit $WRANGLER_EXIT
