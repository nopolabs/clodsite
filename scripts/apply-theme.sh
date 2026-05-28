#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/site-spec.json" ]; then
  echo "Error: ${SITE_DIR}/site-spec.json not found."
  exit 1
fi

STYLE=$(node -e "const s=JSON.parse(require('fs').readFileSync('${SITE_DIR}/site-spec.json','utf8')); console.log(s.site.style)")
THEME_FILE="scaffold/src/css/themes/${STYLE}.css"

if [ ! -f "$THEME_FILE" ]; then
  echo "Error: Theme file not found: $THEME_FILE"
  echo "Valid styles: minimal, professional, bold"
  exit 1
fi

echo "✓ Theme: $STYLE ($THEME_FILE exists)"
