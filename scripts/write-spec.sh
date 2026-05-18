#!/usr/bin/env bash
set -euo pipefail

DRAFT="scripts/.spec-draft.json"

if [ ! -f "$DRAFT" ]; then
  echo "Error: $DRAFT not found."
  echo "This script is called by the /interview command after Claude writes the spec JSON."
  exit 1
fi

# Validate it's parseable JSON
if ! node -e "JSON.parse(require('fs').readFileSync('$DRAFT', 'utf8'))" 2>/dev/null; then
  echo "Error: $DRAFT is not valid JSON. Check Claude's output."
  exit 1
fi

# Ensure site/ directory exists
mkdir -p site

# Save as site/site-spec.json (pretty-printed for human readability)
node -e "
const spec = JSON.parse(require('fs').readFileSync('$DRAFT', 'utf8'));
require('fs').writeFileSync('site/site-spec.json', JSON.stringify(spec, null, 2) + '\n');
"

# Clean up draft
rm "$DRAFT"

echo "✓ Spec written to site/site-spec.json"
echo ""
echo "Next step: run /plan"
