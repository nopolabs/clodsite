#!/usr/bin/env bash
set -euo pipefail

PLAN="${1:?Usage: $0 <path-to-build-plan.yaml>}"
[ -f "$PLAN" ] || { echo "Error: $PLAN not found"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/lib/migrate-plan-to-components.mjs" "$PLAN"
