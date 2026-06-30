#!/usr/bin/env bash
# Read-only Stripe ⇄ ORDERS KV reconciliation for paid commerce sessions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_sites_dir

SITE_FILTER="${1:-}"

node "${SCRIPT_DIR}/lib/orders-reconcile.mjs" "$SITES_DIR" "$SITE_FILTER"
