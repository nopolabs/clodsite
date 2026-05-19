#!/usr/bin/env bash
set -euo pipefail

echo "Building site with Eleventy..."
echo ""

# Ensure the pinned Eleventy version is installed.
# Without this, npx would download an arbitrary version on the fly —
# slow, and non-deterministic across machines.
if [ ! -d "scaffold/node_modules" ]; then
  echo "Installing scaffold dependencies (first build)..."
  (cd scaffold && npm install)
  echo ""
fi

# Clear stale output — Eleventy does not remove files from a previous build,
# so a renamed or deleted page would otherwise linger in site/dist/.
rm -rf site/dist

# Run from scaffold/ so .eleventy.js config resolves correctly.
# Output goes to ../site/dist (repo-root site/dist/).
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
