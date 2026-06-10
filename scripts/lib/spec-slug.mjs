// Prints the URL-safe slug derived from site.name in a site-spec.json.
// Invoked by scripts/migrate-site.sh:
//   node scripts/lib/spec-slug.mjs <spec-path>
import fs from 'fs';

const [specPath] = process.argv.slice(2);
if (!specPath) {
  console.error('Usage: node spec-slug.mjs <spec-path>');
  process.exit(2);
}

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const slug = spec.site.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
console.log(slug);
