#!/usr/bin/env bash
# Sync the commerce catalog from the plan's fulfillment provider.
# Writes $SITE_DIR/commerce/catalog.json and mirrors product images into
# $SITE_DIR/commerce/assets/. Provider credentials (e.g. PRINTFUL_API_KEY)
# come from .env, which lib/sites.sh sources.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

PLAN="${SITE_DIR}/build-plan.yaml"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan first."
  exit 1
fi

node "${SCRIPT_DIR}/lib/commerce-sync.mjs" "$SITE_DIR"
