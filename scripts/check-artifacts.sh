#!/usr/bin/env bash
set -euo pipefail

# Reports whether previous build(s) left artifacts in SITES_DIR.
# Used by /setup to offer a clean-or-keep choice. Read-only.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_sites_dir

if [ -d "$SITES_DIR" ] && [ -n "$(ls -A "$SITES_DIR" 2>/dev/null)" ]; then
  echo "ARTIFACTS_FOUND"
  ls -1 "$SITES_DIR"
else
  echo "NO_ARTIFACTS"
fi
