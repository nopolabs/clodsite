// Validates Open Knowledge Format (OKF) frontmatter across the docs knowledge
// surface. Contract: docs/knowledge/index.md.
//
// Adoption is incremental: a markdown file WITHOUT frontmatter is "not yet
// adopted" and is skipped, not failed. A file WITH frontmatter must conform —
// `type` is required and must be a known concept type; other known fields are
// type-checked; producer-defined custom fields are allowed (OKF is extensible).
//
// CLI usage:
//   node scripts/lib/validate-okf.mjs [paths...]
// With no paths, scans the default knowledge surface (AGENTS.md + docs/**.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

// The concept type vocabulary. Kept in lockstep with the table in
// docs/knowledge/index.md by validate-okf.test.mjs.
export const VALID_TYPES = [
  'Guide', 'Reference', 'Spec', 'Plan', 'Component', 'Theme', 'Site',
];

const VALID_STATUS = ['draft', 'accepted', 'shipped', 'superseded'];

// ISO 8601 date or datetime (e.g. 2026-06-28 or 2026-06-28T00:00:00Z).
const ISO_8601 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => isNonEmptyString(v));
}

// Splits leading YAML frontmatter from a markdown document. Returns
// { hasFrontmatter, raw, frontmatter, parseError }. `frontmatter` is the parsed
// object when parsing succeeds; `parseError` is set when the block is malformed.
export function parseFrontmatter(text) {
  if (!text.startsWith('---\n') && text !== '---') {
    return { hasFrontmatter: false };
  }
  // Find the closing delimiter line after the opening one.
  const rest = text.slice(4);
  const end = rest.indexOf('\n---');
  if (end === -1) {
    return { hasFrontmatter: true, parseError: 'frontmatter opening "---" has no closing "---"' };
  }
  const raw = rest.slice(0, end);
  let frontmatter;
  try {
    frontmatter = yaml.load(raw);
  } catch (error) {
    return { hasFrontmatter: true, parseError: 'frontmatter is not valid YAML: ' + error.message };
  }
  return { hasFrontmatter: true, raw, frontmatter };
}

// Validates a parsed frontmatter object. Returns an array of error strings.
export function validateFrontmatter(frontmatter) {
  const errors = [];

  if (!isObject(frontmatter)) {
    errors.push('frontmatter must be a YAML mapping');
    return errors;
  }

  // type — the one required field.
  if (!('type' in frontmatter)) {
    errors.push('missing required field "type"');
  } else if (!isNonEmptyString(frontmatter.type)) {
    errors.push('"type" must be a non-empty string');
  } else if (!VALID_TYPES.includes(frontmatter.type)) {
    errors.push('"type" must be one of: ' + VALID_TYPES.join(', ') + ' (got "' + frontmatter.type + '")');
  }

  // Known optional fields — type-checked when present. Unknown fields are
  // allowed: OKF lets producers add custom fields.
  if ('title' in frontmatter && !isNonEmptyString(frontmatter.title)) {
    errors.push('"title" must be a non-empty string');
  }
  if ('description' in frontmatter && !isNonEmptyString(frontmatter.description)) {
    errors.push('"description" must be a non-empty string');
  }
  if ('tags' in frontmatter && !isStringArray(frontmatter.tags)) {
    errors.push('"tags" must be an array of non-empty strings');
  }
  if ('timestamp' in frontmatter) {
    const ts = frontmatter.timestamp;
    // js-yaml parses unquoted ISO timestamps into Date objects.
    const ok = ts instanceof Date
      ? !Number.isNaN(ts.getTime())
      : (typeof ts === 'string' && ISO_8601.test(ts));
    if (!ok) errors.push('"timestamp" must be an ISO 8601 date or datetime');
  }
  if ('status' in frontmatter && !VALID_STATUS.includes(frontmatter.status)) {
    errors.push('"status" must be one of: ' + VALID_STATUS.join(', '));
  }
  if ('resource' in frontmatter && !isNonEmptyString(frontmatter.resource)) {
    errors.push('"resource" must be a non-empty string (a URL or path)');
  }
  if ('supersedes' in frontmatter && !isStringArray(frontmatter.supersedes)) {
    errors.push('"supersedes" must be an array of concept paths');
  }

  return errors;
}

// Validates a single file's frontmatter. Returns
// { path, adopted, errors }. `adopted` is false when the file has no
// frontmatter (skipped, not an error).
export function validateFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = parseFrontmatter(text);
  if (!parsed.hasFrontmatter) {
    return { path: filePath, adopted: false, errors: [] };
  }
  if (parsed.parseError) {
    return { path: filePath, adopted: true, errors: [parsed.parseError] };
  }
  return { path: filePath, adopted: true, errors: validateFrontmatter(parsed.frontmatter) };
}

// Recursively collects *.md files under a directory.
function collectMarkdown(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdown(full, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// The default knowledge surface scanned when the CLI gets no paths.
export function defaultSurface(root = REPO_ROOT) {
  const files = [];
  const agents = path.join(root, 'AGENTS.md');
  if (fs.existsSync(agents)) files.push(agents);
  const docs = path.join(root, 'docs');
  if (fs.existsSync(docs)) collectMarkdown(docs, files);
  return files.sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const files = args.length > 0 ? args : defaultSurface();

  const results = files.map(validateFile);
  const failed = results.filter((r) => r.errors.length > 0);
  const adopted = results.filter((r) => r.adopted && r.errors.length === 0);
  const skipped = results.filter((r) => !r.adopted);

  if (failed.length > 0) {
    console.error('OKF validation failed (' + failed.length + ' file(s)):');
    for (const r of failed) {
      console.error('  ✗ ' + path.relative(REPO_ROOT, r.path));
      for (const e of r.errors) console.error('      ' + e);
    }
    process.exit(1);
  }

  console.log('✓ OKF: ' + adopted.length + ' conformant, ' + skipped.length + ' not yet adopted');
}
