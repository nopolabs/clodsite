#!/usr/bin/env bash
# Usage:
#   bash scripts/revise-normalize.sh [--dry-run] <site> ["message"]
#
# Normalize a site before a governed revision: verify clean authored state and
# deploy the current site with the latest Clodsite when generated output drift
# is detected. Default mode is a real deploy; --dry-run only reports the deploy
# command it would run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  shift
fi

SITE_NAME="${1:-}"
DEPLOY_MESSAGE="${2:-refresh generated output for current Clodsite}"

if [ -z "$SITE_NAME" ]; then
  echo "Usage: bash scripts/revise-normalize.sh [--dry-run] <site> [\"message\"]" >&2
  exit 2
fi

BASELINE_OUTPUT=""
if BASELINE_OUTPUT="$(bash "${SCRIPT_DIR}/revise-report.sh" --check-baseline "$SITE_NAME" 2>&1)"; then
  echo "$BASELINE_OUTPUT"
  echo "✓ ${SITE_NAME}: already normalized for the current Clodsite"
  exit 0
fi

if ! echo "$BASELINE_OUTPUT" | grep -q "generated output is stale for the current Clodsite compiler"; then
  echo "$BASELINE_OUTPUT" >&2
  exit 1
fi

echo "$BASELINE_OUTPUT"
echo "==> normalize"
if [ "$DRY_RUN" = true ]; then
  echo "Would run: bash scripts/build-deploy.sh ${SITE_NAME} \"${DEPLOY_MESSAGE}\""
  exit 0
fi

bash "${SCRIPT_DIR}/build-deploy.sh" "$SITE_NAME" "$DEPLOY_MESSAGE"
