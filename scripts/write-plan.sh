#!/usr/bin/env bash
set -euo pipefail

DRAFT="scripts/.plan-draft.md"

if [ ! -f "$DRAFT" ]; then
  echo "Error: $DRAFT not found."
  echo "This script is called by the /plan command after Claude writes the build plan."
  exit 1
fi

cp "$DRAFT" build-plan.md
rm "$DRAFT"

echo "✓ Build plan written to build-plan.md"
echo ""
echo "Review build-plan.md — check the page copy and structure."
echo "When ready: run /build"
