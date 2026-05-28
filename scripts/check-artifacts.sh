#!/usr/bin/env bash
set -euo pipefail

# Reports whether previous build(s) left artifacts in sites/.
# Used by /setup to offer a clean-or-keep choice. Read-only.

if [ -d "sites" ] && [ -n "$(ls -A sites 2>/dev/null)" ]; then
  echo "ARTIFACTS_FOUND"
  ls -1 sites/
else
  echo "NO_ARTIFACTS"
fi
