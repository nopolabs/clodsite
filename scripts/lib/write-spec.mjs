// Parses and pretty-prints site-spec.json in place.
// Invoked by scripts/write-spec.sh:
//   node scripts/lib/write-spec.mjs <spec-path>
// Exits 1 if the file is not valid JSON.
import fs from 'fs';

const [specPath] = process.argv.slice(2);
if (!specPath) {
  console.error('Usage: node write-spec.mjs <spec-path>');
  process.exit(2);
}

let spec;
try {
  spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
} catch (_) {
  process.exit(1);
}

fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
