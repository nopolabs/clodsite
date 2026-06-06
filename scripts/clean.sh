#!/usr/bin/env bash
set -euo pipefail

# Remove a site's build artifacts.
#
# Usage: bash scripts/clean.sh <site-slug>
#
# Destructive: deletes SITES_DIR/<slug>/ entirely and clears generated scaffold
# files. Intentionally NOT auto-allowed in .claude/settings.json.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"

SITE="${1:?Usage: bash scripts/clean.sh <site-slug>}"
SITE_DIR="$(clodsite_site_dir_for "$SITE")"

if [ ! -d "$SITE_DIR" ]; then
  echo "Error: $SITE_DIR not found."
  exit 1
fi

echo "Cleaning $SITE_DIR..."
rm -rf "$SITE_DIR"
echo "✓ Cleaned: $SITE_DIR"
