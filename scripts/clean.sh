#!/usr/bin/env bash
set -euo pipefail

# Remove a site's build artifacts.
#
# Usage: bash scripts/clean.sh <site-slug>
#
# Destructive: deletes sites/<slug>/ entirely and clears generated scaffold
# files. Intentionally NOT auto-allowed in .claude/settings.json.

SITE="${1:?Usage: bash scripts/clean.sh <site-slug>}"
SITE_DIR="sites/$SITE"

if [ ! -d "$SITE_DIR" ]; then
  echo "Error: $SITE_DIR not found."
  exit 1
fi

echo "Cleaning $SITE_DIR..."
rm -rf "$SITE_DIR"
rm -f scaffold/src/*.njk
rm -f scaffold/src/_data/site.json
echo "✓ Cleaned: $SITE_DIR and scaffold/src/ artifacts"
