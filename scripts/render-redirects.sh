#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

PLAN="${SITE_DIR}/build-plan.yaml"
DIST="${SITE_DIR}/dist"
OUTPUT="${DIST}/_redirects"

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
const rules = Array.isArray(plan.redirects) ? plan.redirects : [];

fs.rmSync(outputPath, { force: true });

if (rules.length === 0) {
  console.log('✓ No redirects configured; stale _redirects removed');
  process.exit(0);
}

// Cloudflare _redirects: one rule per line, "FROM  TO  STATUS". The plan has
// already passed validate-plan, so from/to/status are well-formed here.
const lines = rules.map(rule => {
  const status = rule.status || 301;
  return rule.from + '  ' + rule.to + '  ' + status;
});

fs.writeFileSync(outputPath, lines.join('\n') + '\n');
console.log('✓ ' + outputPath + ' written (' + rules.length + ' rule(s))');
NODE
