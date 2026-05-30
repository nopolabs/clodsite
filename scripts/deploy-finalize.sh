#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/.deploy-output" ]; then
  echo "Error: No deployment output found. Run /deploy first."
  exit 1
fi

SITE_NAME=$(node -e "
const yaml = require('js-yaml');
const plan = yaml.load(require('fs').readFileSync('${SITE_DIR}/build-plan.yaml', 'utf8'));
console.log(plan.slug);
")

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
if [ -d "sites/.git" ]; then
  git -C sites add "${SITE_DIR_NAME}/" 2>/dev/null || true
  git -C sites commit -m "deploy: ${SITE_DIR_NAME} → ${PROD_URL}" 2>/dev/null || true
fi
