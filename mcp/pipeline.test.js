'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listComponents, extractUrl, stripAnsi } = require('./pipeline.js');

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