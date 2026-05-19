#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "scripts/.deploy-output" ]; then
  echo "Error: No deployment output found. Run /deploy first."
  exit 1
fi

# Parse deployment URL from wrangler stdout
DEPLOY_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.pages\.dev' scripts/.deploy-output | tail -1)

if [ -z "$DEPLOY_URL" ]; then
  echo "Error: Could not parse deployment URL from wrangler output."
  echo "Raw output:"
  cat scripts/.deploy-output
  exit 1
fi

# Derive site name for substitution
SITE_NAME=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('site/site-spec.json', 'utf8'));
const slug = spec.site.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
console.log(slug);
")

# Update site/site-spec.json with deployed URL
node -e "
const spec = JSON.parse(require('fs').readFileSync('site/site-spec.json', 'utf8'));
if (!spec.meta) spec.meta = {};
spec.meta.deployed_url = '$DEPLOY_URL';
require('fs').writeFileSync('site/site-spec.json', JSON.stringify(spec, null, 2));
"

# Write site/NEXT-STEPS.md from template
sed "s|{{DEPLOY_URL}}|$DEPLOY_URL|g; s|{{SITE_NAME}}|$SITE_NAME|g" \
  scripts/templates/NEXT-STEPS.template.md > site/NEXT-STEPS.md

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Your site is live!                          ║"
echo "║                                              ║"
printf  "║  %-44s ║\n" "$DEPLOY_URL"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "See site/NEXT-STEPS.md for next steps (custom domain, GitHub Actions, analytics)."
