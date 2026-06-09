#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

PLAN="${SITE_DIR}/build-plan.yaml"
DIST="${SITE_DIR}/dist"
OUTPUT="${DIST}/_headers"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan first."
  exit 1
fi

if [ ! -d "$DIST" ]; then
  echo "Error: $DIST not found. Run /build first."
  exit 1
fi

node - "$PLAN" "$OUTPUT" <<'NODE'
const fs = require('fs');
const yaml = require('js-yaml');

const planPath = process.argv[2];
const outputPath = process.argv[3];
const plan = yaml.load(fs.readFileSync(planPath, 'utf8'));
const rules = Array.isArray(plan.headers) ? plan.headers : [];

fs.rmSync(outputPath, { force: true });

if (rules.length === 0) {
  console.log('✓ No response headers configured; stale _headers removed');
  process.exit(0);
}

const blocks = rules.map(rule => {
  const lines = [rule.path.trim()];
  for (const [name, value] of Object.entries(rule.values)) {
    lines.push('  ' + name + ': ' + value);
  }
  return lines.join('\n');
});

fs.writeFileSync(outputPath, blocks.join('\n\n') + '\n');
console.log('✓ ' + outputPath + ' written (' + rules.length + ' rule(s))');
NODE
