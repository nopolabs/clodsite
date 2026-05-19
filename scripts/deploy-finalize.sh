#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "scripts/.deploy-output" ]; then
  echo "Error: No deployment output found. Run /deploy first."
  exit 1
fi

# Derive site name (slug) — this is the Cloudflare Pages project name.
SITE_NAME=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('site/site-spec.json', 'utf8'));
const slug = spec.site.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
console.log(slug);
")

# Production URL — stable, always serves the latest production deployment.
# This is the URL to share. Deterministic from the project name, no parsing.
PROD_URL="https://${SITE_NAME}.pages.dev"

# Deployment-specific URL — an immutable snapshot of THIS build, parsed from
# wrangler output. Informational only: it goes stale on the next deploy.
BUILD_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.pages\.dev' scripts/.deploy-output | tail -1)

# Record the production URL in the spec.
node -e "
const spec = JSON.parse(require('fs').readFileSync('site/site-spec.json', 'utf8'));
if (!spec.meta) spec.meta = {};
spec.meta.deployed_url = '$PROD_URL';
require('fs').writeFileSync('site/site-spec.json', JSON.stringify(spec, null, 2) + '\n');
"

# Write site/NEXT-STEPS.md from template — headlines the stable production URL.
sed "s|{{DEPLOY_URL}}|$PROD_URL|g; s|{{SITE_NAME}}|$SITE_NAME|g" \
  scripts/templates/NEXT-STEPS.template.md > site/NEXT-STEPS.md

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
echo "See site/NEXT-STEPS.md for next steps (custom domain, GitHub Actions, analytics)."
