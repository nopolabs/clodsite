#!/usr/bin/env bash
set -euo pipefail

PLAN="${1:?Usage: $0 <path-to-build-plan.yaml>}"
[ -f "$PLAN" ] || { echo "Error: $PLAN not found"; exit 1; }

node -e "
const fs   = require('fs');
const yaml = require('js-yaml');
const plan = yaml.load(fs.readFileSync('$PLAN', 'utf8'));

if ('build_notes' in plan) delete plan.build_notes;

for (const page of (plan.pages || [])) {
  if ('content' in page && !('components' in page)) {
    page.components = [{ type: 'prose', markdown: page.content }];
    delete page.content;
  }
}

fs.writeFileSync('$PLAN', yaml.dump(plan, { lineWidth: -1, noRefs: true }));
console.log('✓ migrated ' + '$PLAN');
"
