// Syncs the commerce catalog from the plan's fulfillment provider.
// Invoked by scripts/commerce-sync.sh:
//   node scripts/lib/commerce-sync.mjs <site-dir>
//
// Providers with a sync half live at commerce/providers/<provider>/sync.mjs
// and export syncCatalog(config, env). The orchestrator validates whatever the
// provider wrote — the catalog contract (validate-catalog.mjs) holds for ALL
// providers, so a provider bug surfaces here, not at build time.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import yaml from 'js-yaml';
import { readCatalog, validateCatalog } from './validate-catalog.mjs';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

export async function commerceSync(siteDir, env) {
  const plan = yaml.load(fs.readFileSync(path.join(siteDir, 'build-plan.yaml'), 'utf8'));
  const commerce = plan.commerce;

  if (!commerce || commerce.enabled !== true) {
    console.log('Commerce is not enabled in build-plan.yaml — nothing to sync.');
    return;
  }
  const provider = commerce.provider;
  if (provider === 'manual') {
    console.log('Provider "manual" has no sync module — commerce/catalog.json is maintained by hand.');
    return;
  }
  const syncPath = path.join(LIB_DIR, 'commerce', 'providers', provider, 'sync.mjs');
  if (!fs.existsSync(syncPath)) {
    throw new Error(
      'commerce provider "' + provider + '" has no sync.mjs at ' + syncPath +
      ' — only providers with a catalog sync implementation can be synced',
    );
  }

  const { syncCatalog } = await import(pathToFileURL(syncPath).href);
  await syncCatalog({ siteDir, commerce }, env);

  // Contract check: the provider must have written a valid catalog.
  const catalogPath = path.join(siteDir, 'commerce', 'catalog.json');
  const errors = validateCatalog(readCatalog(catalogPath));
  if (errors.length > 0) {
    throw new Error(
      'provider "' + provider + '" produced an invalid catalog:\n  - ' + errors.join('\n  - '),
    );
  }
  console.log('✓ Synced commerce/catalog.json (provider: ' + provider + ')');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [siteDir] = process.argv.slice(2);
  if (!siteDir) {
    console.error('Usage: node commerce-sync.mjs <site-dir>');
    process.exit(2);
  }
  try {
    await commerceSync(siteDir, process.env);
  } catch (error) {
    console.error('Error: ' + error.message);
    process.exit(1);
  }
}
