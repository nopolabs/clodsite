#!/usr/bin/env bash
# Note: not using set -e here — we capture wrangler exit code manually

set -uo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
MODE="${1:-}"

# ── --local: serve locally, no Cloudflare token needed ───────────────────────
if [ "$MODE" = "--local" ]; then
  echo "Starting local dev server at http://localhost:8080 (Ctrl-C to stop)..."
  echo ""
  cd scaffold && exec npm run serve
fi

# ── Cloudflare Pages deploy ──────────────────────────────────────────────────

if [ ! -f ".env" ]; then
  echo "Error: .env not found. Run /setup first."
  exit 1
fi

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

if [ ! -f "${SITE_DIR}/build-plan.yaml" ]; then
  echo "Error: ${SITE_DIR}/build-plan.yaml not found. Run /plan first."
  exit 1
fi

if [ ! -d "${SITE_DIR}/dist" ] || [ -z "$(ls -A "${SITE_DIR}/dist" 2>/dev/null)" ]; then
  echo "Error: ${SITE_DIR}/dist/ is empty or missing. Run /build first."
  exit 1
fi

SITE_NAME=$(node -e "
const yaml = require('js-yaml');
const plan = yaml.load(require('fs').readFileSync('${SITE_DIR}/build-plan.yaml', 'utf8'));
console.log(plan.slug);
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

wrangler pages deploy "${SITE_DIR}/dist" --project-name "$SITE_NAME" \
  > "${SITE_DIR}/.deploy-output" 2> "${SITE_DIR}/.deploy-error"
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > "${SITE_DIR}/.deploy-exit"
exit $WRANGLER_EXIT
