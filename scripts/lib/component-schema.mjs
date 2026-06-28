// Shared rendering for component schema.json files. Used by both
// generate-catalog-md.mjs (the agent-facing CATALOG.md) and
// generate-component-concepts.mjs (the OKF Component concept bundle), so the
// two representations are generated from one source and can't drift.
import fs from 'node:fs';
import path from 'node:path';

export function describeDescriptor(descriptor) {
  if (typeof descriptor === 'string') return descriptor;
  let description = descriptor.type;
  if (descriptor.non_empty === true) description = 'non-empty ' + description;
  if (Array.isArray(descriptor.enum))
    description += '; one of: ' + descriptor.enum.join(', ');
  if (Number.isInteger(descriptor.min_items))
    description += '; minimum ' + descriptor.min_items + ' items';
  if (Number.isInteger(descriptor.max_items))
    description += '; maximum ' + descriptor.max_items + ' items';
  if (descriptor.format === 'href')
    description += '; root-relative path, fragment, HTTPS URL, or mailto URL';
  return description;
}

function collectFields(fields, prefix, requiredOut, optionalOut, isRequired) {
  for (const [field, descriptor] of Object.entries(fields || {})) {
    const fieldPath = prefix ? prefix + '.' + field : field;
    const target = isRequired ? requiredOut : optionalOut;
    target.push([fieldPath, describeDescriptor(descriptor)]);

    if (descriptor && typeof descriptor === 'object' && descriptor.type === 'object') {
      collectFields(descriptor.required || {}, fieldPath, requiredOut, optionalOut, true);
      collectFields(descriptor.optional || {}, fieldPath, requiredOut, optionalOut, false);
    }
    if (descriptor && typeof descriptor === 'object' && descriptor.type === 'array' &&
        descriptor.items && typeof descriptor.items === 'object') {
      const itemPath = fieldPath + '[]';
      target.push([itemPath, describeDescriptor(descriptor.items)]);
      if (descriptor.items.type === 'object') {
        collectFields(descriptor.items.required || {}, itemPath, requiredOut, optionalOut, true);
        collectFields(descriptor.items.optional || {}, itemPath, requiredOut, optionalOut, false);
      }
    }
  }
}

function renderFieldList(entries) {
  if (entries.length === 0) return '_(none)_\n\n';
  return entries.map(([field, description]) =>
    '- `' + field + '` (' + description + ')'
  ).join('\n') + '\n\n';
}

// The required/optional/example block for one component schema — everything
// below the component heading and description. Output is shared verbatim by
// CATALOG.md sections and Component concept bodies.
export function renderFields(schema) {
  const requiredFields = [];
  const optionalFields = [];
  collectFields(schema.required || {}, '', requiredFields, optionalFields, true);
  collectFields(schema.optional || {}, '', requiredFields, optionalFields, false);

  let out = '**Required fields:**\n\n' + renderFieldList(requiredFields);
  out += '**Optional fields:**\n\n' + renderFieldList(optionalFields);
  if (schema.example) {
    out += '**Example:**\n\n```yaml\n' + schema.example.trimEnd() + '\n```\n\n';
  }
  return out;
}

// Sorted component names (directories under the components dir that have a
// schema.json).
export function listComponentNames(dir) {
  return fs.readdirSync(dir)
    .filter((n) => fs.statSync(path.join(dir, n)).isDirectory())
    .filter((n) => fs.existsSync(path.join(dir, n, 'schema.json')))
    .sort();
}

export function loadSchema(dir, name) {
  return JSON.parse(fs.readFileSync(path.join(dir, name, 'schema.json'), 'utf8'));
}
