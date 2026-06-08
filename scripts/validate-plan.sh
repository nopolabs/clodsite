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

function validateValue(value, descriptor, fieldPath) {
  if (typeof descriptor === 'string') {
    if (!checkType(value, descriptor))
      errors.push(fieldPath + ' must be ' + descriptor);
    return;
  }

  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor) ||
      typeof descriptor.type !== 'string') {
    errors.push('invalid schema descriptor for ' + fieldPath);
    return;
  }

  const descriptorKeys = new Set([
    'type', 'enum', 'non_empty', 'required', 'optional', 'items', 'min_items'
  ]);
  const unknownDescriptorKey = Object.keys(descriptor).find(key => !descriptorKeys.has(key));
  if (unknownDescriptorKey) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': unknown rule \"' + unknownDescriptorKey + '\"');
    return;
  }
  if ('enum' in descriptor &&
      (descriptor.type !== 'string' || !Array.isArray(descriptor.enum))) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': enum requires type string');
    return;
  }
  if ('non_empty' in descriptor &&
      (descriptor.type !== 'string' || typeof descriptor.non_empty !== 'boolean')) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': non_empty requires type string');
    return;
  }
  if (('required' in descriptor || 'optional' in descriptor) && descriptor.type !== 'object') {
    errors.push('invalid schema descriptor for ' + fieldPath + ': required/optional require type object');
    return;
  }
  if (descriptor.type === 'object' &&
      (('required' in descriptor && !checkType(descriptor.required, 'object')) ||
       ('optional' in descriptor && !checkType(descriptor.optional, 'object')))) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': required/optional must be objects');
    return;
  }
  if ('items' in descriptor && descriptor.type !== 'array') {
    errors.push('invalid schema descriptor for ' + fieldPath + ': items requires type array');
    return;
  }
  if ('min_items' in descriptor &&
      (descriptor.type !== 'array' || !Number.isInteger(descriptor.min_items) ||
       descriptor.min_items < 0)) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': min_items requires a non-negative integer and type array');
    return;
  }

  if (!checkType(value, descriptor.type)) {
    errors.push(fieldPath + ' must be ' + descriptor.type);
    return;
  }

  if (descriptor.type === 'string') {
    if (descriptor.non_empty === true && value.trim().length === 0)
      errors.push(fieldPath + ' must be a non-empty string');
    if (Array.isArray(descriptor.enum) && !descriptor.enum.includes(value))
      errors.push(fieldPath + ' must be one of: ' + descriptor.enum.join(', '));
  }

  if (descriptor.type === 'object') {
    const required = descriptor.required || {};
    const optional = descriptor.optional || {};

    for (const [field, nestedDescriptor] of Object.entries(required)) {
      const nestedPath = fieldPath + '.' + field;
      if (!(field in value)) {
        errors.push(nestedPath + ' is required');
      } else {
        validateValue(value[field], nestedDescriptor, nestedPath);
      }
    }

    for (const [field, nestedDescriptor] of Object.entries(optional)) {
      if (field in value)
        validateValue(value[field], nestedDescriptor, fieldPath + '.' + field);
    }

    const allowed = new Set([...Object.keys(required), ...Object.keys(optional)]);
    for (const field of Object.keys(value)) {
      if (!allowed.has(field))
        errors.push(fieldPath + ' has unknown field \"' + field + '\"');
    }
  }

  if (descriptor.type === 'array') {
    if (typeof descriptor.min_items === 'number' && value.length < descriptor.min_items)
      errors.push(fieldPath + ' must have at least ' + descriptor.min_items + ' item(s)');
    if (descriptor.items) {
      value.forEach(function(item, idx) {
        validateValue(item, descriptor.items, fieldPath + '[' + idx + ']');
      });
    }
  }
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
        for (const [field, descriptor] of Object.entries(required)) {
          if (!(field in c)) {
            errors.push(ctag + '.' + field + ' is required');
          } else {
            validateValue(c[field], descriptor, ctag + '.' + field);
          }
        }
        const optional = schema.optional || {};
        for (const [field, descriptor] of Object.entries(optional)) {
          if (field in c)
            validateValue(c[field], descriptor, ctag + '.' + field);
        }
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
