#!/usr/bin/env bash
# Diagnose a commerce checkout/fulfillment path for one Stripe Checkout Session.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

SESSION_ID="${1:-}"
if [ -z "$SESSION_ID" ]; then
  echo "Usage: SITES_DIR=/path/to/sites SITE_NAME=<site> bash scripts/commerce-debug.sh <stripe-session-id>"
  exit 2
fi

node "${SCRIPT_DIR}/lib/commerce-debug.mjs" "$SITE_DIR" "$SESSION_ID"
