#!/usr/bin/env bash
set -euo pipefail

SPEC="site/site-spec.json"

if [ ! -f "$SPEC" ]; then
  echo "Error: $SPEC not found."
  echo "This script is called by the /interview command after Claude writes the spec JSON."
  exit 1
fi

# Validate it's parseable JSON
if ! node -e "JSON.parse(require('fs').readFileSync('$SPEC', 'utf8'))" 2>/dev/null; then
  echo "Error: $SPEC is not valid JSON. Check Claude's output."
  exit 1
fi

# Pretty-print in place for human readability
node -e "
const spec = JSON.parse(require('fs').readFileSync('$SPEC', 'utf8'));
require('fs').writeFileSync('$SPEC', JSON.stringify(spec, null, 2) + '\n');
"

echo "✓ Spec written to site/site-spec.json"
echo ""
echo "Next step: run /plan"
