'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  BUILD_SCRIPTS,
  listComponents,
  extractUrl,
  stripAnsi,
  deploySite,
  getSchema,
} = require('./pipeline.js');

test('listComponents returns catalog with all component types', () => {
  const catalog = listComponents();
  assert.ok(catalog.includes('prose'));
  assert.ok(catalog.includes('gallery'));
  assert.ok(catalog.includes('mailto-form'));
  assert.ok(catalog.includes('resend-form'));
  // should be a brief listing, not full sub-schemas
  assert.ok(!catalog.includes('Required fields:'));
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
  const { mkdtempSync, rmSync } = require('fs');
  const { join } = require('path');
  const { tmpdir } = require('os');
  const oldSitesDir = process.env.SITES_DIR;
  const sitesDir = mkdtempSync(join(tmpdir(), 'clodsite-mcp-sites-'));
  process.env.SITES_DIR = sitesDir;
  const result = await deploySite('mcp-test', 'not: valid: yaml: [[[');
  // Clean up before asserting so the directory is always removed.
  rmSync(sitesDir, { recursive: true, force: true });
  if (oldSitesDir === undefined) delete process.env.SITES_DIR;
  else process.env.SITES_DIR = oldSitesDir;
  assert.equal(result.error, true);
  assert.equal(result.step, 'validate-plan');
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
});

test('getSchema() returns top-level build-plan.yaml reference', () => {
  const schema = getSchema();
  // Top-level required fields
  assert.ok(schema.includes('slug:'));
  assert.ok(schema.includes('name:'));
  assert.ok(schema.includes('overview:'));
  assert.ok(schema.includes('style:'));
  assert.ok(schema.includes('tone:'));
  assert.ok(schema.includes('custom_domain:'));
  assert.ok(schema.includes('head:'));
  assert.ok(schema.includes('pages:'));
  assert.ok(schema.includes('nav:'));
  assert.ok(schema.includes('contact:'));
  assert.ok(schema.includes('headers:'));
  // Valid enum values documented
  assert.ok(schema.includes('minimal'));
  assert.ok(schema.includes('professional'));
  assert.ok(schema.includes('bold'));
  assert.ok(schema.includes('casual'));
  assert.ok(schema.includes('technical'));
  assert.ok(schema.includes('friendly'));
  // Pointer to component drill-down
  assert.ok(schema.includes('get_schema'));
  // Should NOT embed full component sub-schemas inline
  assert.ok(!schema.includes('type: prose\n'));
});

test('deploy pipeline renders headers after build and before deploy', () => {
  assert.ok(BUILD_SCRIPTS.includes('render-headers.sh'));
  assert.ok(BUILD_SCRIPTS.indexOf('build-site.sh') < BUILD_SCRIPTS.indexOf('render-headers.sh'));
  assert.ok(BUILD_SCRIPTS.indexOf('render-headers.sh') < BUILD_SCRIPTS.indexOf('deploy.sh'));
});

test('getSchema(component_name) returns sub-schema and example', () => {
  const prose = getSchema('prose');
  assert.ok(prose.includes('prose'));
  assert.ok(prose.includes('markdown'));
  assert.ok(prose.includes('Example:'));

  const gallery = getSchema('gallery');
  assert.ok(gallery.includes('gallery'));
  assert.ok(gallery.includes('images'));
  assert.ok(gallery.includes('Example:'));

  const form = getSchema('mailto-form');
  assert.ok(form.includes('mailto-form'));
  assert.ok(form.includes('fields'));
  assert.ok(form.includes('Example:'));

  const resendForm = getSchema('resend-form');
  assert.ok(resendForm.includes('resend-form'));
  assert.ok(resendForm.includes('turnstile'));
  assert.ok(resendForm.includes('boolean'));
});

test('getSchema(unknown) returns helpful error with available types', () => {
  const result = getSchema('not-a-component');
  assert.ok(result.includes('Unknown component'));
  assert.ok(result.includes('prose'));
});

test('server.js loads without throwing', () => {
  // Require server.js in a way that does not start the stdio transport.
  // server.js guards startup behind `require.main === module`, so requiring
  // it here only registers handlers and exports the server instance.
  const { server } = require('./server.js');
  assert.ok(server, 'server instance is exported');
});

test('server advertises purpose via instructions', () => {
  const { server } = require('./server.js');
  const instructions = server._options?.instructions;
  assert.ok(typeof instructions === 'string' && instructions.length > 0, 'instructions must be a non-empty string');
  assert.ok(instructions.includes('deploy'), 'instructions should mention deploying');
  assert.ok(instructions.includes('build-plan.yaml'), 'instructions should mention build-plan.yaml');
});
