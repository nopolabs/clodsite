#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

if [ ! -f "${SITE_DIR}/build-plan.yaml" ]; then
  echo "Error: ${SITE_DIR}/build-plan.yaml not found. Run /plan first."
  exit 1
fi

# Wipe src/ so stale templates from removed pages can't survive a rebuild.
# The render step (after this script) writes fresh .njk files; the node
# program below recreates src/_data/site.json.
rm -rf "${SITE_DIR}/src"

node "${SCRIPT_DIR}/lib/write-site-json.mjs" "$SITE_DIR"
