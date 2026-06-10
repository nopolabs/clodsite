#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir
SPEC="${1:-${SITE_DIR}/site-spec.json}"

if [ ! -f "$SPEC" ]; then
  echo "Error: $SPEC not found. Run /interview first."
  exit 1
fi

node "${SCRIPT_DIR}/lib/validate-spec.mjs" "$SPEC"
