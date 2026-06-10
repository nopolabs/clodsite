#!/usr/bin/env bash
# Note: not using set -e here — we capture wrangler exit code manually

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir
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

SITE_NAME=$(node "${SCRIPT_DIR}/lib/build-plan.mjs" \
  "${SITE_DIR}/build-plan.yaml" slug)

if [ -f "${SITE_DIR}/functions/api/contact.js" ] && [ -z "${RESEND_API_KEY:-}" ]; then
  echo "Error: RESEND_API_KEY is not set in .env but this site uses resend-form."
  echo "Add RESEND_API_KEY=re_... to .env and redeploy."
  exit 1
fi

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

# Protected forms provision or reuse their Turnstile widget, push its secret,
# and inject the public site key and expected hostnames into built artifacts.
if ! bash "${SCRIPT_DIR}/provision-turnstile.sh"; then
  exit 1
fi

# Push RESEND_API_KEY as a Pages secret when the generated contact Function is
# present. Other future Functions do not require this secret.
if [ -f "${SITE_DIR}/functions/api/contact.js" ]; then
  echo "Setting RESEND_API_KEY secret for '$SITE_NAME'..."
  if ! printf '%s' "$RESEND_API_KEY" | wrangler pages secret put RESEND_API_KEY \
      --project-name "$SITE_NAME"; then
    echo "Error: failed to set RESEND_API_KEY Pages secret."
    exit 1
  fi
  echo ""
fi

echo "Deploying '$SITE_NAME' to Cloudflare Pages..."
echo ""

# Wrangler discovers functions/ relative to its working directory.
cd "${SITE_DIR}"
wrangler pages deploy dist --project-name "$SITE_NAME" \
  > ".deploy-output" 2> ".deploy-error"
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > ".deploy-exit"
exit $WRANGLER_EXIT
