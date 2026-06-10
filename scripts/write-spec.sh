#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir
SPEC="${SITE_DIR}/site-spec.json"

if [ ! -f "$SPEC" ]; then
  echo "Error: $SPEC not found."
  echo "This script is called by the /interview command after Claude writes the spec JSON."
  exit 1
fi

# Validate it's parseable JSON, then pretty-print in place for human readability
if ! node "${SCRIPT_DIR}/lib/write-spec.mjs" "$SPEC" 2>/dev/null; then
  echo "Error: $SPEC is not valid JSON. Check Claude's output."
  exit 1
fi

echo "✓ Spec written to ${SITE_DIR}/site-spec.json"
echo ""
echo "Next step: run /plan $(basename "${SITE_DIR}")"
