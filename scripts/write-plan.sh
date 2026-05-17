#!/usr/bin/env bash
set -euo pipefail

DRAFT="scripts/.plan-draft.md"

if [ ! -f "$DRAFT" ]; then
  echo "Error: $DRAFT not found."
  echo "This script is called by the /plan command after Claude writes the build plan."
  exit 1
fi

mkdir -p site
cp "$DRAFT" site/build-plan.md
rm "$DRAFT"

echo "✓ Build plan written to site/build-plan.md"
echo ""
echo "Review site/build-plan.md — check the page copy and structure."
echo "When ready: run /build"
