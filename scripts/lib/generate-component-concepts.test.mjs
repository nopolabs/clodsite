import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generateConcepts, renderConceptFile } from './generate-component-concepts.mjs';
import { listComponentNames } from './component-schema.mjs';
import { parseFrontmatter, validateFrontmatter } from './validate-okf.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const componentsDir = path.join(repoRoot, 'components');
const committedDir = path.join(repoRoot, 'docs/knowledge/components');

test('each component concept has conformant Component frontmatter', () => {
  for (const name of listComponentNames(componentsDir)) {
    const text = fs.readFileSync(path.join(committedDir, name + '.md'), 'utf8');
    const { frontmatter } = parseFrontmatter(text);
    assert.equal(frontmatter.type, 'Component', name + ' should be type Component');
    assert.deepEqual(validateFrontmatter(frontmatter), [], name + ' frontmatter invalid');
  }
});

test('renderConceptFile uses the component name as title and includes the example', () => {
  const out = renderConceptFile('hero', { description: 'X', example: 'type: hero\n' });
  assert.match(out, /title: "hero"/);
  assert.match(out, /type: Component/);
  assert.match(out, /```yaml/);
});

// Golden test: committed bundle must equal a fresh generation. Regenerate with
// scripts/generate-catalog-md.sh when a schema or the generator changes.
test('committed docs/knowledge/components matches the generator output', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'concepts-'));
  try {
    const written = generateConcepts(componentsDir, tmp);
    const committedFiles = fs.readdirSync(committedDir).filter((f) => f.endsWith('.md')).sort();
    assert.deepEqual(committedFiles, written, 'file set differs — run scripts/generate-catalog-md.sh');
    for (const file of written) {
      assert.equal(
        fs.readFileSync(path.join(committedDir, file), 'utf8'),
        fs.readFileSync(path.join(tmp, file), 'utf8'),
        file + ' is stale — run scripts/generate-catalog-md.sh',
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
