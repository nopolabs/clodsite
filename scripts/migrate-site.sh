#!/usr/bin/env bash
set -euo pipefail

# Auto-migrate a v1 site/ directory to sites/<slug>/.
# Idempotent: exits 0 silently if site/site-spec.json does not exist.

if [ ! -f "site/site-spec.json" ]; then
  exit 0
fi

SLUG=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('site/site-spec.json', 'utf8'));
const slug = spec.site.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+\$/g, '');
console.log(slug);
")

DEST="sites/$SLUG"

if [ -d "$DEST" ]; then
  echo "Error: $DEST already exists. Cannot auto-migrate site/ — move it manually to avoid overwriting."
  exit 1
fi

mkdir -p sites
echo "Migrating site/ → $DEST..."
mv site/ "$DEST/"
echo "✓ Migrated: site/ → $DEST/"
