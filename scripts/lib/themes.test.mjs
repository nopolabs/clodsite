import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatThemeList, listThemeNames } from './themes.mjs';

test('listThemeNames derives theme names from css files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-themes-'));
  try {
    fs.writeFileSync(path.join(dir, 'terminal.css'), ':root {}');
    fs.writeFileSync(path.join(dir, 'academic.css'), ':root {}');
    fs.writeFileSync(path.join(dir, 'README.md'), 'not a theme');

    assert.deepEqual(listThemeNames(dir), ['academic', 'terminal']);
    assert.equal(formatThemeList(listThemeNames(dir)), 'academic, terminal');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listThemeNames rejects missing or empty theme directories', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-themes-empty-'));
  try {
    assert.throws(() => listThemeNames(path.join(dir, 'missing')), /theme directory not found/);
    assert.throws(() => listThemeNames(dir), /no themes found/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
