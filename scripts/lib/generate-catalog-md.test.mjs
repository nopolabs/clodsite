import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderCatalog } from './generate-catalog-md.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

// Golden test: the committed CATALOG.md must equal a fresh generation. If a
// component schema changes, regenerate with scripts/generate-catalog-md.sh.
test('committed components/CATALOG.md matches the generator output', () => {
  const committed = fs.readFileSync(path.join(repoRoot, 'components/CATALOG.md'), 'utf8');
  const generated = renderCatalog(path.join(repoRoot, 'components'));
  assert.equal(
    committed,
    generated,
    'components/CATALOG.md is stale — run scripts/generate-catalog-md.sh',
  );
});
