#!/usr/bin/env bash
set -euo pipefail

# Reports whether a previous build left artifacts in site/.
# Used by /setup to offer a clean-or-keep choice. Read-only.

if [ -d "site" ] && [ -n "$(ls -A site 2>/dev/null)" ]; then
  echo "ARTIFACTS_FOUND"
  ls -1 site/
else
  echo "NO_ARTIFACTS"
fi
