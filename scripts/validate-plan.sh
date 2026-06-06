#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir
PLAN="${SITE_DIR}/build-plan.yaml"
COMPONENTS_DIR="${COMPONENTS_DIR:-components}"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan first."
  exit 1
fi

node -e "
const yaml = require('js-yaml');
const fs   = require('fs');
const path = require('path');

const plan = yaml.load(fs.readFileSync('$PLAN', 'utf8'));
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

if ('build_notes' in plan)
  errors.push('build_notes is no longer supported (removed in component-catalog v1)');

if ('custom_domain' in plan && plan.custom_domain !== null && typeof plan.custom_domain !== 'string')
  errors.push('custom_domain must be a string hostname or omitted');
if (typeof plan.custom_domain === 'string' && plan.custom_domain.trim() !== '') {
  const domain = plan.custom_domain.trim();
  if (/^https?:\/\//i.test(domain) || domain.includes('/'))
    errors.push('custom_domain must be a hostname only, e.g. www.example.com');
}

const catalog = {};
if (fs.existsSync('$COMPONENTS_DIR')) {
  for (const name of fs.readdirSync('$COMPONENTS_DIR')) {
    const schemaPath = path.join('$COMPONENTS_DIR', name, 'schema.json');
    if (fs.existsSync(schemaPath)) {
      catalog[name] = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    }
  }
}

function checkType(value, type) {
  if (type === 'string')  return typeof value === 'string';
  if (type === 'array')   return Array.isArray(value);
  if (type === 'object')  return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'number')  return typeof value === 'number';
  if (type === 'boolean') return typeof value === 'boolean';
  return true;
}

if (!Array.isArray(plan.pages) || plan.pages.length < 1) {
  errors.push('pages must be a non-empty array');
} else {
  plan.pages.forEach(function(p, i) {
    const tag = 'pages[' + i + ']';
    if (!p.id)    errors.push(tag + '.id is required');
    if (!p.title) errors.push(tag + '.title is required');
    if ('content' in p)
      errors.push(tag + '.content is no longer supported — use components: [{ type: prose, markdown: ... }]');
    if (!Array.isArray(p.components) || p.components.length === 0) {
      errors.push(tag + '.components must be a non-empty array');
    } else {
      p.components.forEach(function(c, j) {
        const ctag = tag + '.components[' + j + ']';
        if (!c.type) {
          errors.push(ctag + '.type is required');
          return;
        }
        const schema = catalog[c.type];
        if (!schema) {
          errors.push(ctag + '.type \"' + c.type + '\" is not a known component (see $COMPONENTS_DIR/CATALOG.md)');
          return;
        }
        const required = schema.required || {};
        for (const [field, type] of Object.entries(required)) {
          if (!(field in c)) {
            errors.push(ctag + ' missing required field \"' + field + '\"');
          } else if (!checkType(c[field], type)) {
            errors.push(ctag + '.' + field + ' must be ' + type);
          }
        }
        const optional = schema.optional || {};
        const allowed = new Set(['type', ...Object.keys(required), ...Object.keys(optional)]);
        for (const key of Object.keys(c)) {
          if (!allowed.has(key)) {
            errors.push(ctag + ' has unknown field \"' + key + '\" for component type \"' + c.type + '\"');
          }
        }
      });
    }
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
