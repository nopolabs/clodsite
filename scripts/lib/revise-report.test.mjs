import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  collectNameStatus,
  dirtyOffenders,
  functionLabel,
  parsePorcelainZ,
  renderReport,
  routeForDistPath,
} from './revise-report.mjs';

test('routeForDistPath maps built files to report categories', () => {
  assert.deepEqual(routeForDistPath('demo', 'demo/dist/index.html'), { kind: 'route', label: '/' });
  assert.deepEqual(routeForDistPath('demo', 'demo/dist/about/index.html'), { kind: 'route', label: '/about/' });
  assert.deepEqual(routeForDistPath('demo', 'demo/dist/404.html'), { kind: 'route', label: '404 page' });
  assert.deepEqual(routeForDistPath('demo', 'demo/dist/_headers'), { kind: 'policy', label: '_headers' });
  assert.deepEqual(routeForDistPath('demo', 'demo/dist/_redirects'), { kind: 'policy', label: '_redirects' });
  assert.deepEqual(routeForDistPath('demo', 'demo/dist/assets/logo.png'), { kind: 'asset', label: 'assets/logo.png' });
  assert.equal(routeForDistPath('demo', 'other/dist/index.html'), null);
});

test('dirtyOffenders enforces baseline and report dirt rules', () => {
  const entries = [
    { path: 'demo/build-plan.yaml' },
    { path: 'demo/assets/new.png' },
    { path: 'demo/dist/index.html' },
    { path: 'demo/functions/api/checkout.js' },
    { path: 'demo/NEXT-STEPS.md' },
  ];
  assert.deepEqual(dirtyOffenders(entries, 'demo', 'baseline'), [
    'demo/build-plan.yaml',
    'demo/assets/new.png',
    'demo/dist/index.html',
    'demo/functions/api/checkout.js',
    'demo/NEXT-STEPS.md',
  ]);
  assert.deepEqual(dirtyOffenders(entries, 'demo', 'report'), ['demo/NEXT-STEPS.md']);
});

test('functionLabel maps generated function paths', () => {
  assert.equal(functionLabel('demo', 'demo/functions/api/checkout.js'), 'api/checkout.js');
  assert.equal(functionLabel('demo', 'other/functions/api/checkout.js'), null);
});

test('parsePorcelainZ reads nul-delimited git status records', () => {
  const parsed = parsePorcelainZ(Buffer.from(' M demo/build-plan.yaml\0?? demo/assets/new.png\0'));
  assert.deepEqual(parsed, [
    { status: ' M', path: 'demo/build-plan.yaml' },
    { status: '??', path: 'demo/assets/new.png' },
  ]);
});

test('parsePorcelainZ treats rename pairs as one record', () => {
  const parsed = parsePorcelainZ(Buffer.from('R  demo/assets/new.png\0demo/assets/old.png\0'));
  assert.deepEqual(parsed, [
    { status: 'R ', path: 'demo/assets/new.png', origPath: 'demo/assets/old.png' },
  ]);
  assert.deepEqual(dirtyOffenders(parsed, 'demo', 'report'), []);
});

test('dirtyOffenders checks both sides of a rename', () => {
  const entries = [
    { status: 'R ', path: 'demo/assets/new.png', origPath: 'demo/NEXT-STEPS.md' },
  ];
  assert.deepEqual(dirtyOffenders(entries, 'demo', 'report'), ['demo/NEXT-STEPS.md']);
});

test('collectNameStatus includes untracked files as added', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-revise-status-'));
  try {
    execFileSync('git', ['-C', root, 'init', '-q']);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test User']);
    fs.mkdirSync(path.join(root, 'demo', 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'demo', 'dist', 'index.html'), 'old');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'initial']);

    fs.writeFileSync(path.join(root, 'demo', 'dist', 'index.html'), 'new');
    fs.mkdirSync(path.join(root, 'demo', 'dist', 'about'));
    fs.writeFileSync(path.join(root, 'demo', 'dist', 'about', 'index.html'), 'new');

    assert.equal(
      collectNameStatus(root, ['demo/dist']),
      'M\tdemo/dist/index.html\nA\tdemo/dist/about/index.html'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('renderReport warns on removed routes without redirects', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-revise-report-'));
  try {
    const redirects = path.join(root, '_redirects');
    fs.writeFileSync(redirects, '/old  /new  301\n');
    const report = renderReport({
      siteName: 'demo',
      siteRel: 'demo',
      redirectsPath: redirects,
      authoredStatusText: 'M\tdemo/build-plan.yaml',
      distStatusText: [
        'M\tdemo/dist/index.html',
        'A\tdemo/dist/shop/index.html',
        'D\tdemo/dist/old/index.html',
        'D\tdemo/dist/orphan/index.html',
        'M\tdemo/dist/_headers',
        'A\tdemo/dist/assets/logo.png',
      ].join('\n'),
      functionStatusText: 'M\tdemo/functions/api/checkout.js',
    });
    assert.match(report, /M \/ — changed/);
    assert.match(report, /A \/shop\/ — added/);
    assert.match(report, /D \/old\/ — removed$/m);
    assert.match(report, /D \/orphan\/ — removed \(WARNING: no redirect covers this removed route\)/);
    assert.match(report, /M _headers — changed/);
    assert.match(report, /A assets\/logo\.png — added/);
    assert.match(report, /M api\/checkout\.js — changed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
