#!/usr/bin/env bash
set -euo pipefail

# Auto-migrate a v1 site/ directory to SITES_DIR/<slug>/.
# Idempotent: exits 0 silently if site/site-spec.json does not exist.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_sites_dir

if [ ! -f "site/site-spec.json" ]; then
  exit 0
fi

SLUG=$(node "${SCRIPT_DIR}/lib/spec-slug.mjs" "site/site-spec.json")

DEST="${SITES_DIR}/${SLUG}"

if [ -d "$DEST" ]; then
  echo "Error: $DEST already exists. Cannot auto-migrate site/ — move it manually to avoid overwriting."
  exit 1
fi

mkdir -p "$SITES_DIR"
echo "Migrating site/ → $DEST..."
mv site/ "$DEST/"
echo "✓ Migrated: site/ → $DEST/"
