#!/usr/bin/env bash
set -euo pipefail

echo "Building site with Eleventy..."
echo ""

# Run from scaffold/ so .eleventy.js config resolves correctly
# Output goes to ../dist (repo root dist/)
(cd scaffold && npx @11ty/eleventy 2>&1)

echo ""

# Verify output
if [ ! -d "site/dist" ] || [ -z "$(ls -A site/dist 2>/dev/null)" ]; then
  echo "Error: Build produced an empty site/dist/. Check Eleventy output above."
  exit 1
fi

PAGE_COUNT=$(find site/dist -name "*.html" | wc -l | tr -d ' ')
echo "✓ Build complete. $PAGE_COUNT HTML file(s) in site/dist/"
echo ""
echo "Next step: run /deploy"
