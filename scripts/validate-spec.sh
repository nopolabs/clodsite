#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
SPEC="${1:-${SITE_DIR}/site-spec.json}"

if [ ! -f "$SPEC" ]; then
  echo "Error: $SPEC not found. Run /interview first."
  exit 1
fi

node -e "
const spec = JSON.parse(require('fs').readFileSync('$SPEC', 'utf8'));
const errors = [];
const site = spec.site || {};

if (!site.name)     errors.push('site.name is required');
if (!site.purpose)  errors.push('site.purpose is required');
if (!site.audience) errors.push('site.audience is required');

const validTones = ['professional', 'casual', 'technical', 'friendly'];
if (!validTones.includes(site.tone))
  errors.push('site.tone must be one of: ' + validTones.join(', ') + ' (got: ' + site.tone + ')');

const validStyles = ['minimal', 'professional', 'bold'];
if (!validStyles.includes(site.style))
  errors.push('site.style must be one of: ' + validStyles.join(', ') + ' (got: ' + site.style + ')');

if (!Array.isArray(spec.pages) || spec.pages.length < 2 || spec.pages.length > 5) {
  errors.push('pages must be an array of 2-5 items (got: ' + (Array.isArray(spec.pages) ? spec.pages.length : 'non-array') + ')');
} else {
  const ids = spec.pages.map(p => p.id);
  const seen = new Set();
  ids.forEach(function(id) { if (seen.has(id)) errors.push('duplicate page id: ' + id); seen.add(id); });
  spec.pages.forEach(function(p, i) {
    if (!p.id || !/^[a-z0-9-]+\$/.test(p.id)) errors.push('pages[' + i + '].id must be lowercase alphanumeric/hyphens (got: ' + p.id + ')');
    if (!p.title)           errors.push('pages[' + i + '].title is required');
    if (!p.purpose)         errors.push('pages[' + i + '].purpose is required');
    if (!p.content_outline) errors.push('pages[' + i + '].content_outline is required');
  });
}

const contact = spec.contact || {};
if (contact.enabled) {
  if (contact.type !== 'email')
    errors.push('contact.type must be \"email\" when contact.enabled is true (form contact is a v2 feature)');
  if (!contact.email)
    errors.push('contact.email is required when contact.enabled is true');
}

const domain = spec.domain || {};
if (domain.custom && !domain.hostname)
  errors.push('domain.hostname is required when domain.custom is true');

const validStatus = ['provided', 'draft'];
if (!validStatus.includes(spec.content_status))
  errors.push('content_status must be one of: ' + validStatus.join(', ') + ' (got: ' + spec.content_status + ')');

if (errors.length > 0) {
  console.error('Spec validation failed (' + errors.length + ' error(s)):');
  errors.forEach(function(e) { console.error('  ✗ ' + e); });
  process.exit(1);
}
console.log('✓ Spec is valid (' + spec.pages.length + ' pages, style: ' + site.style + ')');
"
