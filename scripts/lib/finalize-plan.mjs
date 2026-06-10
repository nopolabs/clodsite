// Injects the display name from site-spec.json into build-plan.yaml.
// Invoked by scripts/finalize-plan.sh:
//   node scripts/lib/finalize-plan.mjs <spec-path> <plan-path>
import fs from 'fs';
import yaml from 'js-yaml';

const [specPath, planPath] = process.argv.slice(2);
if (!specPath || !planPath) {
  console.error('Usage: node finalize-plan.mjs <spec-path> <plan-path>');
  process.exit(2);
}

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const plan = yaml.load(fs.readFileSync(planPath, 'utf8'));

plan.name = spec.site.name;

fs.writeFileSync(planPath, yaml.dump(plan, { lineWidth: -1, noRefs: true }));
console.log('✓ Injected name: ' + plan.name);
