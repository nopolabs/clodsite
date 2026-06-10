#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPONENTS_DIR="${COMPONENTS_DIR:-components}"

if [ ! -d "$COMPONENTS_DIR" ]; then
  echo "Error: $COMPONENTS_DIR/ not found"
  exit 1
fi

node "${SCRIPT_DIR}/lib/generate-catalog-md.mjs" "$COMPONENTS_DIR"
