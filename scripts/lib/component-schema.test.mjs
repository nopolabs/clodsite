import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  describeDescriptor,
  renderFields,
  listComponentNames,
  loadSchema,
} from './component-schema.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const componentsDir = path.join(repoRoot, 'components');

test('describeDescriptor: string descriptor passes through', () => {
  assert.equal(describeDescriptor('free text'), 'free text');
});

test('describeDescriptor: composes modifiers', () => {
  assert.equal(
    describeDescriptor({ type: 'string', non_empty: true, enum: ['a', 'b'] }),
    'non-empty string; one of: a, b',
  );
  assert.equal(
    describeDescriptor({ type: 'array', min_items: 1, max_items: 2 }),
    'array; minimum 1 items; maximum 2 items',
  );
  assert.equal(
    describeDescriptor({ type: 'string', format: 'href' }),
    'string; root-relative path, fragment, HTTPS URL, or mailto URL',
  );
});

test('renderFields: flattens nested object/array fields', () => {
  const schema = {
    required: { heading: { type: 'string', non_empty: true } },
    optional: {
      actions: {
        type: 'array', min_items: 1, max_items: 2,
        items: { type: 'object', required: { label: { type: 'string' } }, optional: {} },
      },
    },
  };
  const out = renderFields(schema);
  assert.match(out, /\*\*Required fields:\*\*/);
  assert.match(out, /- `heading`/);
  assert.match(out, /- `actions\[\]\.label`/); // nested item field flattened
});

test('renderFields: empty field set renders "(none)"', () => {
  assert.match(renderFields({ required: {}, optional: {} }), /_\(none\)_/);
});

test('listComponentNames: returns sorted dirs that have schema.json', () => {
  const names = listComponentNames(componentsDir);
  assert.ok(names.includes('hero'));
  assert.ok(names.includes('prose'));
  assert.deepEqual(names, [...names].sort());
  // CATALOG.md is a file, not a component dir.
  assert.ok(!names.includes('CATALOG.md'));
});

test('loadSchema: reads and parses a component schema', () => {
  const hero = loadSchema(componentsDir, 'hero');
  assert.equal(typeof hero.description, 'string');
  assert.ok(hero.required.heading);
});
