// Migrates a pre-component build-plan.yaml: page.content → prose component,
// drops build_notes. Invoked by scripts/migrate-plan-to-components.sh:
//   node scripts/lib/migrate-plan-to-components.mjs <plan-path>
import fs from 'fs';
import yaml from 'js-yaml';

const [planPath] = process.argv.slice(2);
if (!planPath) {
  console.error('Usage: node migrate-plan-to-components.mjs <plan-path>');
  process.exit(2);
}

const plan = yaml.load(fs.readFileSync(planPath, 'utf8'));

if ('build_notes' in plan) delete plan.build_notes;

for (const page of (plan.pages || [])) {
  if ('content' in page && !('components' in page)) {
    page.components = [{ type: 'prose', markdown: page.content }];
    delete page.content;
  }
}

fs.writeFileSync(planPath, yaml.dump(plan, { lineWidth: -1, noRefs: true }));
console.log('✓ migrated ' + planPath);
