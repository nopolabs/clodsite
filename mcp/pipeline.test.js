'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listComponents, extractUrl, stripAnsi, deploySite, getSchema } = require('./pipeline.js');

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

test('getSchema returns annotated build-plan.yaml covering all fields and components', () => {
  const schema = getSchema();
  // Top-level required fields
  assert.ok(schema.includes('slug:'));
  assert.ok(schema.includes('name:'));
  assert.ok(schema.includes('overview:'));
  assert.ok(schema.includes('style:'));
  assert.ok(schema.includes('tone:'));
  assert.ok(schema.includes('pages:'));
  assert.ok(schema.includes('nav:'));
  assert.ok(schema.includes('contact:'));
  // Valid enum values documented
  assert.ok(schema.includes('minimal'));
  assert.ok(schema.includes('professional'));
  assert.ok(schema.includes('bold'));
  assert.ok(schema.includes('casual'));
  assert.ok(schema.includes('technical'));
  assert.ok(schema.includes('friendly'));
  // All three component types present
  assert.ok(schema.includes('type: prose'));
  assert.ok(schema.includes('type: gallery'));
  assert.ok(schema.includes('type: mailto-form'));
});

test('server.js loads without throwing', () => {
  // Require server.js in a way that does not start the stdio transport.
  // server.js guards startup behind `require.main === module`, so requiring
  // it here only registers handlers and exports the server instance.
  const { server } = require('./server.js');
  assert.ok(server, 'server instance is exported');
});
