#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

if [ ! -f "${SITE_DIR}/.deploy-output" ]; then
  echo "Error: No deployment output found. Run /deploy first."
  exit 1
fi

PLAN_VALUES=$(node "${SCRIPT_DIR}/lib/build-plan.mjs" \
  "${SITE_DIR}/build-plan.yaml" slug resend-turnstile)
SITE_NAME=$(echo "$PLAN_VALUES" | sed -n '1p')
TURNSTILE_ENABLED=$(echo "$PLAN_VALUES" | sed -n '2p')

BUILD_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.pages\.dev' "${SITE_DIR}/.deploy-output" | tail -1)

# Derive production URL from the snapshot URL by stripping the 8-char deployment
# hash prefix. Cloudflare may assign a suffixed subdomain (e.g. test-1-ah5.pages.dev)
# when the bare project name is globally taken — constructing the URL from the spec
# slug would point at the wrong (or someone else's) project.
if [ -n "$BUILD_URL" ]; then
  PROD_URL=$(echo "$BUILD_URL" | sed 's|https://[a-f0-9]\{8\}\.|https://|')
else
  PROD_URL="https://${SITE_NAME}.pages.dev"
fi


sed "s|{{DEPLOY_URL}}|$PROD_URL|g; s|{{SITE_NAME}}|$SITE_NAME|g" \
  scripts/templates/NEXT-STEPS.template.md > "${SITE_DIR}/NEXT-STEPS.md"

if [ -f "${SITE_DIR}/functions/api/contact.js" ] && [ "$TURNSTILE_ENABLED" != "true" ]; then
  cat >> "${SITE_DIR}/NEXT-STEPS.md" << RESEND_WARNING

---

## Contact form: add bot protection before going live

Your site includes a \`resend-form\` contact form. The \`/api/contact\` endpoint
is publicly accessible with no rate limiting or bot protection. Before
promoting this site:

1. Add **Cloudflare Turnstile** - run \`/domain $SITE_NAME\` first, then see
   the Turnstile skill in Claude Code
2. Or enable **Rate Limiting** on \`/api/contact\` in the Cloudflare dashboard

Without this, anyone can automate submissions and exhaust your Resend quota,
damaging your sender reputation.
RESEND_WARNING
elif [ -f "${SITE_DIR}/functions/api/contact.js" ] && [ "$TURNSTILE_ENABLED" = "true" ]; then
  cat >> "${SITE_DIR}/NEXT-STEPS.md" << TURNSTILE_CONFIRMATION

---

## Contact form protection

Cloudflare Turnstile is enabled for the \`/api/contact\` endpoint. Clodsite
created or reused the site's managed widget, restricted it to the production
hostnames, and installed its secret in Cloudflare Pages.
TURNSTILE_CONFIRMATION
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Your site is live!                          ║"
echo "║                                              ║"
printf  "║  %-44s ║\n" "$PROD_URL"
echo "╚══════════════════════════════════════════════╝"
echo ""
if [ -n "$BUILD_URL" ] && [ "$BUILD_URL" != "$PROD_URL" ]; then
  echo "This build's snapshot URL: $BUILD_URL"
  echo ""
fi
echo "See ${SITE_DIR}/NEXT-STEPS.md for next steps."

# Auto-commit to sites repo if initialised
SITE_DIR_NAME=$(basename "${SITE_DIR}")
if [ -d "${SITES_DIR}/.git" ]; then
  git -C "$SITES_DIR" add "${SITE_DIR_NAME}/" 2>/dev/null || true
  git -C "$SITES_DIR" commit -m "deploy: ${SITE_DIR_NAME} → ${PROD_URL}" 2>/dev/null || true
fi
