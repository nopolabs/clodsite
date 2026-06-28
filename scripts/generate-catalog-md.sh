#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPONENTS_DIR="${COMPONENTS_DIR:-components}"

if [ ! -d "$COMPONENTS_DIR" ]; then
  echo "Error: $COMPONENTS_DIR/ not found"
  exit 1
fi

# Writes the catalog reference to CATALOG.md (override the target with CATALOG_OUT,
# e.g. to generate into a temp file without touching the tracked copy).
OUT="${CATALOG_OUT:-${COMPONENTS_DIR}/CATALOG.md}"
node "${SCRIPT_DIR}/lib/generate-catalog-md.mjs" "$COMPONENTS_DIR" > "$OUT"
echo "✓ ${OUT} written"

# Also regenerate the OKF Component concept bundle from the same schemas, so the
# two representations stay in lockstep (override with CONCEPTS_OUT).
CONCEPTS_OUT="${CONCEPTS_OUT:-docs/knowledge/components}"
node "${SCRIPT_DIR}/lib/generate-component-concepts.mjs" "$COMPONENTS_DIR" "$CONCEPTS_OUT"
