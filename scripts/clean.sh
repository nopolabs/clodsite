#!/usr/bin/env bash
set -euo pipefail

# Remove previous build artifacts.
#
# Destructive: deletes the entire site/ directory (spec, plan, dist, NEXT-STEPS)
# and all generated .njk page templates. Use when you want to start fresh.
#
# This is intentionally NOT auto-allowed in .claude/settings.json — destruction
# of a built site should be confirmed every time. It is invoked by:
#   - `/setup clean`           (explicit user intent)
#   - `/setup` "clean or keep" (Claude asks; user says clean)
#   - or directly from a terminal

echo "Cleaning previous build artifacts..."
rm -rf site/
rm -f scaffold/src/*.njk
echo "✓ Cleaned: site/ and scaffold/src/*.njk"
