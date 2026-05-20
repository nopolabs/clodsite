#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "site/build-plan.md" ]; then
  echo "Error: site/build-plan.md not found."
  echo "This script is called by the /plan command after Claude writes the build plan."
  exit 1
fi

echo "✓ Build plan written to site/build-plan.md"
echo ""
echo "Review site/build-plan.md — check the page copy and structure."
echo "When ready: run /build"
