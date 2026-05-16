#!/usr/bin/env bash
set -euo pipefail

SPEC="${1:-site-spec.json}"

if [ ! -f "$SPEC" ]; then
  echo "Error: $SPEC not found. Run /interview first."
  exit 1
fi

node -e "
const spec = JSON.parse(require('fs').readFileSync('$SPEC', 'utf8'));
const errors = [];

if (!spec.site?.name)     errors.push('site.name is required');
if (!spec.site?.purpose)  errors.push('site.purpose is required');
if (!spec.site?.audience) errors.push('site.audience is required');

const validTones = ['professional', 'casual', 'technical', 'friendly'];
if (!validTones.includes(spec.site?.tone))
  errors.push('site.tone must be one of: ' + validTones.join(', ') + ' (got: ' + spec.site?.tone + ')');

const validStyles = ['minimal', 'professional', 'bold'];
if (!validStyles.includes(spec.site?.style))
  errors.push('site.style must be one of: ' + validStyles.join(', ') + ' (got: ' + spec.site?.style + ')');

if (!Array.isArray(spec.pages) || spec.pages.length < 2 || spec.pages.length > 5) {
  errors.push('pages must be an array of 2-5 items (got: ' + (Array.isArray(spec.pages) ? spec.pages.length : 'non-array') + ')');
} else {
  const ids = spec.pages.map(p => p.id);
  const seen = new Set();
  ids.forEach(id => { if (seen.has(id)) errors.push('duplicate page id: ' + id); seen.add(id); });
  spec.pages.forEach((p, i) => {
    if (!p.id || !/^[a-z0-9-]+\$/.test(p.id))      errors.push('pages[' + i + '].id must be lowercase alphanumeric/hyphens (got: ' + p.id + ')');
    if (!p.title)          errors.push('pages[' + i + '].title is required');
    if (!p.purpose)        errors.push('pages[' + i + '].purpose is required');
    if (!p.content_outline) errors.push('pages[' + i + '].content_outline is required');
  });
}

if (spec.contact?.enabled) {
  const validTypes = ['email', 'form'];
  if (!validTypes.includes(spec.contact?.type))
    errors.push('contact.type must be email or form when contact.enabled is true');
  if (spec.contact?.type === 'email' && !spec.contact?.email)
    errors.push('contact.email is required when contact.type is email');
}

if (spec.domain?.custom && !spec.domain?.hostname)
  errors.push('domain.hostname is required when domain.custom is true');

const validStatus = ['provided', 'draft'];
if (!validStatus.includes(spec.content_status))
  errors.push('content_status must be one of: ' + validStatus.join(', ') + ' (got: ' + spec.content_status + ')');

if (errors.length > 0) {
  console.error('Spec validation failed (' + errors.length + ' error(s)):');
  errors.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log('✓ Spec is valid (' + spec.pages.length + ' pages, style: ' + spec.site.style + ')');
"
