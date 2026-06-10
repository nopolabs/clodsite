#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

SPEC="${SITE_DIR}/site-spec.json"
PLAN="${SITE_DIR}/build-plan.yaml"

if [ ! -f "$SPEC" ]; then
  echo "Error: $SPEC not found. Run /interview first."
  exit 1
fi

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan LLM step first."
  exit 1
fi

node "${SCRIPT_DIR}/lib/finalize-plan.mjs" "$SPEC" "$PLAN"

bash scripts/validate-plan.sh
