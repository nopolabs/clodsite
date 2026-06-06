#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

echo "Building site with Eleventy..."
echo ""

if [ ! -d "scaffold/node_modules" ]; then
  echo "Installing scaffold dependencies (first build)..."
  (cd scaffold && npm install)
  echo ""
fi

rm -rf "${SITE_DIR}/dist"
mkdir -p "${SITE_DIR}/assets/favicons"
mkdir -p "${SITE_DIR}/src"

(cd scaffold && npx @11ty/eleventy 2>&1)

echo ""

if [ ! -d "${SITE_DIR}/dist" ] || [ -z "$(ls -A "${SITE_DIR}/dist" 2>/dev/null)" ]; then
  echo "Error: Build produced an empty ${SITE_DIR}/dist/. Check Eleventy output above."
  exit 1
fi

PAGE_COUNT=$(find "${SITE_DIR}/dist" -name "*.html" | wc -l | tr -d ' ')
echo "✓ Build complete. $PAGE_COUNT HTML file(s) in ${SITE_DIR}/dist/"
echo ""
SITE_NAME=$(basename "${SITE_DIR}")
echo "Next step: run /deploy ${SITE_NAME}"
