#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
PLAN="${SITE_DIR}/build-plan.yaml"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan first."
  exit 1
fi

node -e "
const yaml = require('js-yaml');
const plan = yaml.load(require('fs').readFileSync('$PLAN', 'utf8'));
const errors = [];

if (!plan.slug)     errors.push('slug is required');
if (!plan.name)     errors.push('name is required');
if (!plan.overview) errors.push('overview is required');

const validStyles = ['minimal', 'professional', 'bold'];
if (!validStyles.includes(plan.style))
  errors.push('style must be one of: ' + validStyles.join(', ') + ' (got: ' + plan.style + ')');

const validTones = ['professional', 'casual', 'technical', 'friendly'];
if (!validTones.includes(plan.tone))
  errors.push('tone must be one of: ' + validTones.join(', ') + ' (got: ' + plan.tone + ')');

if (!Array.isArray(plan.pages) || plan.pages.length < 1) {
  errors.push('pages must be a non-empty array');
} else {
  plan.pages.forEach(function(p, i) {
    if (!p.id)      errors.push('pages[' + i + '].id is required');
    if (!p.title)   errors.push('pages[' + i + '].title is required');
    if (!p.content) errors.push('pages[' + i + '].content is required');
  });
}

if (!plan.nav || !Array.isArray(plan.nav.order) || plan.nav.order.length < 1)
  errors.push('nav.order must be a non-empty array');

if (plan.nav && Array.isArray(plan.nav.order)) {
  const pageIds = (plan.pages || []).map(function(p) { return p.id; });
  plan.nav.order.forEach(function(id) {
    if (!pageIds.includes(id))
      errors.push('nav.order references unknown page id: ' + id);
  });
}

if (errors.length > 0) {
  console.error('Plan validation failed (' + errors.length + ' error(s)):');
  errors.forEach(function(e) { console.error('  ✗ ' + e); });
  process.exit(1);
}
console.log('✓ Plan is valid (' + plan.pages.length + ' pages, style: ' + plan.style + ')');
"
