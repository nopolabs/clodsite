import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  parseFrontmatter,
  validateFrontmatter,
  validateFile,
  defaultSurface,
  VALID_TYPES,
} from './validate-okf.mjs';

const modulePath = fileURLToPath(new URL('./validate-okf.mjs', import.meta.url));
const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

function withTempFile(name, contents, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-'));
  try {
    const file = path.join(dir, name);
    fs.writeFileSync(file, contents);
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('parseFrontmatter: no frontmatter is detected', () => {
  const r = parseFrontmatter('# Just a heading\n\nbody');
  assert.equal(r.hasFrontmatter, false);
});

test('parseFrontmatter: valid block parses to an object', () => {
  const r = parseFrontmatter('---\ntype: Guide\ntitle: X\n---\n\n# Body');
  assert.equal(r.hasFrontmatter, true);
  assert.equal(r.parseError, undefined);
  assert.equal(r.frontmatter.type, 'Guide');
});

test('parseFrontmatter: unterminated block is an error', () => {
  const r = parseFrontmatter('---\ntype: Guide\nno closing fence\n');
  assert.equal(r.hasFrontmatter, true);
  assert.match(r.parseError, /no closing/);
});

test('parseFrontmatter: malformed YAML is an error', () => {
  const r = parseFrontmatter('---\ntype: [unterminated\n---\n');
  assert.equal(r.hasFrontmatter, true);
  assert.match(r.parseError, /not valid YAML/);
});

test('validateFrontmatter: minimal valid doc passes', () => {
  assert.deepEqual(validateFrontmatter({ type: 'Guide' }), []);
});

test('validateFrontmatter: missing type fails', () => {
  const errors = validateFrontmatter({ title: 'X' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /missing required field "type"/);
});

test('validateFrontmatter: unknown type fails', () => {
  const errors = validateFrontmatter({ type: 'Widget' });
  assert.match(errors[0], /must be one of/);
});

test('validateFrontmatter: bad optional fields fail', () => {
  assert.match(validateFrontmatter({ type: 'Guide', tags: 'nope' })[0], /tags/);
  assert.match(validateFrontmatter({ type: 'Guide', timestamp: 'last week' })[0], /timestamp/);
  assert.match(validateFrontmatter({ type: 'Spec', status: 'done' })[0], /status/);
  assert.match(validateFrontmatter({ type: 'Guide', title: '' })[0], /title/);
});

test('validateFrontmatter: Date timestamp and valid status pass', () => {
  assert.deepEqual(
    validateFrontmatter({ type: 'Spec', status: 'shipped', timestamp: new Date('2026-06-28') }),
    [],
  );
});

test('validateFrontmatter: producer-defined custom fields are allowed', () => {
  assert.deepEqual(validateFrontmatter({ type: 'Site', resource: 'https://x', region: 'us' }), []);
});

test('validateFile: a doc without frontmatter is "not adopted", not an error', () => {
  withTempFile('plain.md', '# No frontmatter\n', (file) => {
    const r = validateFile(file);
    assert.equal(r.adopted, false);
    assert.deepEqual(r.errors, []);
  });
});

test('validateFile: a conformant doc reports no errors', () => {
  withTempFile('good.md', '---\ntype: Reference\ntitle: T\n---\n# Body\n', (file) => {
    const r = validateFile(file);
    assert.equal(r.adopted, true);
    assert.deepEqual(r.errors, []);
  });
});

test('CLI exits 1 and names the file on a bad doc', () => {
  withTempFile('bad.md', '---\ntype: Nope\n---\n', (file) => {
    const result = spawnSync('node', [modulePath, file], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /OKF validation failed/);
    assert.match(result.stderr, /must be one of/);
  });
});

test('CLI exits 0 over the repo knowledge surface', () => {
  const result = spawnSync('node', [modulePath], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /conformant/);
});

test('every adopted doc on the default surface is conformant', () => {
  const failures = defaultSurface()
    .map(validateFile)
    .filter((r) => r.errors.length > 0);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
});

// The validator's type vocabulary must match the documented one. This keeps
// scripts/lib/validate-okf.mjs and docs/knowledge/index.md from drifting.
test('VALID_TYPES matches the table in docs/knowledge/index.md', () => {
  const md = fs.readFileSync(path.join(repoRoot, 'docs/knowledge/index.md'), 'utf8');
  const start = md.indexOf('## Type vocabulary');
  assert.notEqual(start, -1, 'Type vocabulary section not found');
  const after = md.slice(start);
  const nextSection = after.indexOf('\n## ', 3);
  const section = nextSection === -1 ? after : after.slice(0, nextSection);
  const documented = [...section.matchAll(/^\|\s*`(\w+)`\s*\|/gm)]
    .map((m) => m[1])
    .filter((t) => t !== 'type'); // drop the header cell `type`
  assert.deepEqual([...documented].sort(), [...VALID_TYPES].sort());
});
