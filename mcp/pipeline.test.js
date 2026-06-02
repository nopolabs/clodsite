'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listComponents, extractUrl, stripAnsi, deploySite } = require('./pipeline.js');

test('listComponents returns CATALOG.md content', () => {
  const catalog = listComponents();
  assert.ok(catalog.includes('## prose'));
  assert.ok(catalog.includes('## gallery'));
  assert.ok(catalog.includes('## mailto-form'));
});

test('extractUrl returns URL from deploy-finalize stdout', () => {
  const stdout = [
    '╔══════════════════════════════════════════════╗',
    '║  Your site is live!                          ║',
    '║                                              ║',
    '║  https://rosa-florist.pages.dev              ║',
    '╚══════════════════════════════════════════════╝',
  ].join('\n');
  assert.equal(extractUrl(stdout), 'https://rosa-florist.pages.dev');
});

test('extractUrl returns null when no URL present', () => {
  assert.equal(extractUrl('build failed'), null);
});

test('stripAnsi removes ANSI escape sequences', () => {
  assert.equal(stripAnsi('\x1B[31mError: bad input\x1B[0m'), 'Error: bad input');
});

test('stripAnsi trims surrounding whitespace', () => {
  assert.equal(stripAnsi('  hello  '), 'hello');
});

test('deploySite returns error shape when validate-plan fails', async () => {
  const result = await deploySite('mcp-test', 'not: valid: yaml: [[[');
  // Clean up before asserting so the directory is always removed
  const { rmSync } = require('fs');
  const { join } = require('path');
  rmSync(join(__dirname, '..', 'sites', 'mcp-test'), { recursive: true, force: true });
  assert.equal(result.error, true);
  assert.equal(result.step, 'validate-plan');
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
});
