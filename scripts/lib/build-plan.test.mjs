import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  findFirstComponent,
  getCustomDomain,
  getSlug,
  getStyle,
  isResendTurnstileEnabled,
  readBuildPlan,
  selectPlanValues,
} from './build-plan.mjs';

const modulePath = fileURLToPath(new URL('./build-plan.mjs', import.meta.url));

function makePlan(overrides = {}) {
  return {
    slug: 'test-site',
    style: 'bold',
    custom_domain: 'www.example.com',
    pages: [
      {
        components: [
          { type: 'prose', markdown: 'Hello' },
          { type: 'resend-form', turnstile: true },
        ],
      },
    ],
    ...overrides,
  };
}

function withPlanFile(contents, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-build-plan-'));
  const planPath = path.join(directory, 'build-plan.yaml');
  fs.writeFileSync(planPath, contents);
  try {
    return callback(planPath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('readBuildPlan parses a YAML object', () => {
  withPlanFile('slug: parsed-site\nstyle: minimal\n', (planPath) => {
    assert.deepEqual(readBuildPlan(planPath), {
      slug: 'parsed-site',
      style: 'minimal',
    });
  });
});

test('readBuildPlan rejects a non-object document', () => {
  withPlanFile('- one\n- two\n', (planPath) => {
    assert.throws(
      () => readBuildPlan(planPath),
      /build-plan\.yaml must contain an object/
    );
  });
});

test('slug and style queries trim values and reject missing values', () => {
  assert.equal(getSlug(makePlan({ slug: '  trimmed-slug  ' })), 'trimmed-slug');
  assert.equal(getStyle(makePlan({ style: ' minimal ' })), 'minimal');
  assert.throws(() => getSlug(makePlan({ slug: '' })), /slug not set/);
  assert.throws(() => getStyle(makePlan({ style: null })), /style not set/);
});

test('custom domain query supports optional and required values', () => {
  assert.equal(
    getCustomDomain(makePlan({ custom_domain: ' example.com ' })),
    'example.com'
  );
  assert.equal(getCustomDomain(makePlan({ custom_domain: null })), '');
  assert.throws(
    () => getCustomDomain(makePlan({ custom_domain: '' }), { required: true }),
    /custom_domain not set/
  );
});

test('custom domain query rejects URLs and paths', () => {
  for (const customDomain of ['https://example.com', 'example.com/path']) {
    assert.throws(
      () => getCustomDomain(makePlan({ custom_domain: customDomain })),
      /hostname only/
    );
  }
});

test('findFirstComponent searches pages in order', () => {
  const plan = makePlan();
  assert.deepEqual(findFirstComponent(plan, 'resend-form'), {
    type: 'resend-form',
    turnstile: true,
  });
  assert.equal(findFirstComponent(plan, 'hero'), null);
});

test('Turnstile is enabled only by a resend-form with boolean true', () => {
  assert.equal(isResendTurnstileEnabled(makePlan()), true);
  assert.equal(
    isResendTurnstileEnabled(makePlan({
      pages: [{ components: [{ type: 'resend-form', turnstile: false }] }],
    })),
    false
  );
  assert.equal(isResendTurnstileEnabled(makePlan({ pages: [] })), false);
});

test('selectPlanValues returns requested semantic values in order', () => {
  assert.deepEqual(
    selectPlanValues(makePlan(), [
      'slug',
      'style',
      'custom-domain',
      'resend-turnstile',
    ]),
    ['test-site', 'bold', 'www.example.com', 'true']
  );
  assert.throws(
    () => selectPlanValues(makePlan(), ['pages.0']),
    /unknown build-plan selector/
  );
});

test('CLI prints one selected value per line', () => {
  withPlanFile(
    'slug: cli-site\nstyle: professional\ncustom_domain: cli.example.com\n',
    (planPath) => {
      const result = spawnSync(
        process.execPath,
        [modulePath, planPath, 'slug', 'style', 'custom-domain', 'resend-turnstile'],
        { encoding: 'utf8' }
      );

      assert.equal(result.status, 0);
      assert.equal(
        result.stdout,
        'cli-site\nprofessional\ncli.example.com\nfalse\n'
      );
      assert.equal(result.stderr, '');
    }
  );
});

test('CLI reports semantic validation errors', () => {
  withPlanFile('slug: cli-site\n', (planPath) => {
    const result = spawnSync(
      process.execPath,
      [modulePath, planPath, 'required-custom-domain'],
      { encoding: 'utf8' }
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /custom_domain not set in build-plan\.yaml/);
  });
});
