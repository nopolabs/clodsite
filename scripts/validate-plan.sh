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

if ('theme_selector' in plan) {
  const selector = plan.theme_selector;
  if (!isObject(selector)) {
    errors.push('theme_selector must be an object');
  } else {
    const allowed = new Set(['enabled', 'options']);
    for (const field of Object.keys(selector)) {
      if (!allowed.has(field))
        errors.push('theme_selector has unknown field \"' + field + '\"');
    }
    if (typeof selector.enabled !== 'boolean')
      errors.push('theme_selector.enabled must be a boolean');
    if (!Array.isArray(selector.options)) {
      errors.push('theme_selector.options must be an array');
    } else {
      const seen = new Set();
      selector.options.forEach(function(option, index) {
        if (!validStyles.includes(option))
          errors.push('theme_selector.options[' + index + '] must be one of: ' + validStyles.join(', '));
        if (seen.has(option))
          errors.push('theme_selector.options contains duplicate value: ' + option);
        seen.add(option);
      });
      if (selector.enabled === true && selector.options.length < 2)
        errors.push('theme_selector.options must contain at least two themes when enabled');
      if (selector.enabled === true && !seen.has(plan.style))
        errors.push('theme_selector.options must include the site style when enabled');
    }
  }
}

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

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateNonEmptyString(value, fieldPath) {
  if (typeof value !== 'string') {
    errors.push(fieldPath + ' must be a string');
    return false;
  }
  if (value.trim().length === 0) {
    errors.push(fieldPath + ' must be a non-empty string');
    return false;
  }
  return true;
}

function validateHead(head, fieldPath) {
  if (!isObject(head)) {
    errors.push(fieldPath + ' must be an object');
    return;
  }

  const allowed = new Set(['description', 'image']);
  for (const field of Object.keys(head)) {
    if (!allowed.has(field))
      errors.push(fieldPath + ' has unknown field \"' + field + '\"');
  }

  if ('description' in head)
    validateNonEmptyString(head.description, fieldPath + '.description');

  if ('image' in head) {
    const imagePath = fieldPath + '.image';
    if (!isObject(head.image)) {
      errors.push(imagePath + ' must be an object');
      return;
    }

    const imageAllowed = new Set(['src', 'alt']);
    for (const field of Object.keys(head.image)) {
      if (!imageAllowed.has(field))
        errors.push(imagePath + ' has unknown field \"' + field + '\"');
    }

    for (const field of ['src', 'alt']) {
      if (!(field in head.image)) {
        errors.push(imagePath + '.' + field + ' is required');
      } else {
        validateNonEmptyString(head.image[field], imagePath + '.' + field);
      }
    }

    if (typeof head.image.src === 'string' && head.image.src.trim().length > 0) {
      const src = head.image.src.trim();
      let validAbsoluteUrl = false;
      if (/^https:\/\//i.test(src)) {
        try {
          const parsed = new URL(src);
          validAbsoluteUrl = parsed.protocol === 'https:' && parsed.hostname.length > 0;
        } catch (_) {
          validAbsoluteUrl = false;
        }
      }
      if (!(src.startsWith('/') && !src.startsWith('//')) && !validAbsoluteUrl)
        errors.push(imagePath + '.src must be a site-root path or absolute https:// URL');
    }
  }
}

if ('head' in plan)
  validateHead(plan.head, 'head');

if ('headers' in plan) {
  if (!Array.isArray(plan.headers) || plan.headers.length === 0) {
    errors.push('headers must be a non-empty array');
  } else {
    if (plan.headers.length > 100)
      errors.push('headers must contain at most 100 rules');

    const seenPaths = new Set();
    plan.headers.forEach(function(rule, i) {
      const tag = 'headers[' + i + ']';
      if (!isObject(rule)) {
        errors.push(tag + ' must be an object');
        return;
      }

      const allowed = new Set(['path', 'values']);
      for (const field of Object.keys(rule)) {
        if (!allowed.has(field))
          errors.push(tag + ' has unknown field \"' + field + '\"');
      }

      if (!('path' in rule)) {
        errors.push(tag + '.path is required');
      } else if (validateNonEmptyString(rule.path, tag + '.path')) {
        const headerPath = rule.path.trim();
        let validAbsoluteUrl = false;
        if (/^https:\/\//i.test(headerPath)) {
          try {
            const parsed = new URL(headerPath);
            validAbsoluteUrl = parsed.protocol === 'https:' && parsed.hostname.length > 0;
          } catch (_) {
            validAbsoluteUrl = false;
          }
        }
        if (!(headerPath.startsWith('/') || validAbsoluteUrl))
          errors.push(tag + '.path must begin with / or https://');
        if (/[\r\n]/.test(rule.path))
          errors.push(tag + '.path must be a single-line string');
        if (headerPath.length > 2000)
          errors.push(tag + '.path produces a line longer than 2000 characters');
        if (seenPaths.has(headerPath))
          errors.push(tag + '.path duplicates an earlier header path: ' + headerPath);
        seenPaths.add(headerPath);
      }

      if (!('values' in rule)) {
        errors.push(tag + '.values is required');
      } else if (!isObject(rule.values) || Object.keys(rule.values).length === 0) {
        errors.push(tag + '.values must be a non-empty object');
      } else {
        const seenNames = new Set();
        for (const [name, value] of Object.entries(rule.values)) {
          const valuePath = tag + '.values.' + name;
          const normalizedName = name.toLowerCase();
          if (seenNames.has(normalizedName))
            errors.push(tag + '.values has duplicate header name \"' + name + '\"');
          seenNames.add(normalizedName);

          if (name.startsWith('!'))
            errors.push(valuePath + ' uses unsupported header-removal syntax');
          if (!/^[!#$%&'*+\-.^_\x60|~0-9A-Za-z]+$/.test(name))
            errors.push(valuePath + ' has an invalid header name');
          if (validateNonEmptyString(value, valuePath)) {
            if (/[\r\n]/.test(value))
              errors.push(valuePath + ' must be a single-line string');
            if (('  ' + name + ': ' + value).length > 2000)
              errors.push(valuePath + ' produces a line longer than 2000 characters');
          }
        }
      }
    });
  }
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
    'type', 'enum', 'non_empty', 'required', 'optional', 'items', 'min_items',
    'max_items', 'format'
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
  if ('max_items' in descriptor &&
      (descriptor.type !== 'array' || !Number.isInteger(descriptor.max_items) ||
       descriptor.max_items < 0)) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': max_items requires a non-negative integer and type array');
    return;
  }
  if ('min_items' in descriptor && 'max_items' in descriptor &&
      descriptor.max_items < descriptor.min_items) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': max_items must be greater than or equal to min_items');
    return;
  }
  if ('format' in descriptor &&
      (descriptor.type !== 'string' || descriptor.format !== 'href')) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': format must be href and requires type string');
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
    if (descriptor.format === 'href') {
      const hasControlCharacters = /[\u0000-\u001f\u007f]/.test(value);
      const isRootPath = /^\/(?!\/)\S*$/.test(value);
      const isFragment = /^#[^\s#]+$/.test(value);
      const isMailto = /^mailto:[^\s@]+@[^\s@]+$/i.test(value);
      let isHttps = false;
      try {
        const parsed = new URL(value);
        isHttps = parsed.protocol === 'https:' && parsed.hostname.length > 0;
      } catch (_) {
        isHttps = false;
      }
      if (hasControlCharacters || !(isRootPath || isFragment || isMailto || isHttps))
        errors.push(fieldPath + ' must be a root-relative path, fragment, HTTPS URL, or mailto URL');
    }
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
    if (typeof descriptor.max_items === 'number' && value.length > descriptor.max_items)
      errors.push(fieldPath + ' must have at most ' + descriptor.max_items + ' item(s)');
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
    if ('head' in p)
      validateHead(p.head, tag + '.head');
    if ('content' in p)
      errors.push(tag + '.content is no longer supported — use components: [{ type: prose, markdown: ... }]');
    if (!Array.isArray(p.components) || p.components.length === 0) {
      errors.push(tag + '.components must be a non-empty array');
    } else {
      let heroCount = 0;
      p.components.forEach(function(c, j) {
        const ctag = tag + '.components[' + j + ']';
        if (!c.type) {
          errors.push(ctag + '.type is required');
          return;
        }
        if (c.type === 'hero') {
          heroCount += 1;
          if (j !== 0)
            errors.push(ctag + ' hero must be the first component on the page');
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
      if (heroCount > 1)
        errors.push(tag + ' may contain at most one hero component');
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
