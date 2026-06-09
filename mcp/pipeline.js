'use strict';

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUILD_SCRIPTS = [
  'validate-plan.sh',
  'write-site-json.sh',
  'apply-theme.sh',
  'render-templates.sh',
  'render-functions.sh',
  'build-site.sh',
  'render-headers.sh',
  'deploy.sh',
  'deploy-finalize.sh',
];

function readEnvValue(name) {
  if (process.env[name]) return process.env[name];
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return '';
  const line = fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find(l => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : '';
}

function resolveSitesDir() {
  const configured = readEnvValue('SITES_DIR') || 'sites';
  return path.isAbsolute(configured) ? configured : path.join(ROOT, configured);
}

function listComponents() {
  const dir = path.join(ROOT, 'components');
  const names = fs.readdirSync(dir)
    .filter(n => fs.statSync(path.join(dir, n)).isDirectory())
    .sort();

  let out = '# Component Catalog\n\n';
  out += 'Available component types. Call `get_schema` with a component name for the full sub-schema and example.\n\n';
  for (const name of names) {
    const schemaPath = path.join(dir, name, 'schema.json');
    if (!fs.existsSync(schemaPath)) continue;
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    out += `- **${name}** — ${schema.description || '_no description_'}\n`;
  }
  return out;
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').trim();
}

function extractUrl(stdout) {
  const match = stdout.match(/https:\/\/[a-zA-Z0-9-]+\.pages\.dev/);
  return match ? match[0] : null;
}

function runScript(scriptPath, env) {
  return new Promise((resolve) => {
    exec(`bash "${scriptPath}"`, { env, cwd: ROOT }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

async function deploySite(siteName, buildPlanYaml) {
  if (typeof siteName !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(siteName)) {
    return { error: true, step: 'input-validation', message: `Invalid site name: ${siteName}` };
  }

  const sitesDir = resolveSitesDir();
  const siteDir = path.join(sitesDir, siteName);

  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'build-plan.yaml'), buildPlanYaml, 'utf8');

  const env = { ...process.env, SITES_DIR: sitesDir, SITE_DIR: siteDir };

  for (const script of BUILD_SCRIPTS) {
    const scriptPath = path.join(ROOT, 'scripts', script);
    const result = await runScript(scriptPath, env);
    if (!result.ok) {
      return {
        error: true,
        step: script.replace('.sh', ''),
        message: stripAnsi(result.stderr || result.stdout),
      };
    }
    if (script === 'deploy-finalize.sh') {
      const url = extractUrl(result.stdout);
      if (!url) {
        return { error: true, step: 'deploy-finalize', message: 'No pages.dev URL found in deploy output' };
      }
      return { url, site_name: siteName };
    }
  }
}

function getSchema(componentName) {
  if (componentName) {
    const schemaPath = path.join(ROOT, 'components', componentName, 'schema.json');
    if (!fs.existsSync(schemaPath)) {
      const dir = path.join(ROOT, 'components');
      const available = fs.readdirSync(dir)
        .filter(n => fs.statSync(path.join(dir, n)).isDirectory())
        .sort()
        .join(', ');
      return `Unknown component type: "${componentName}". Available types: ${available}`;
    }
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    let out = `# ${componentName}\n\n${schema.description || ''}\n\n`;

    const req = schema.required || {};
    const opt = schema.optional || {};
    if (Object.keys(req).length > 0) {
      out += '**Required fields:**\n';
      for (const [field, type] of Object.entries(req)) out += `- \`${field}\` (${type})\n`;
      out += '\n';
    }
    if (Object.keys(opt).length > 0) {
      out += '**Optional fields:**\n';
      for (const [field, type] of Object.entries(opt)) out += `- \`${field}\` (${type})\n`;
      out += '\n';
    }
    if (schema.example) {
      out += `**Example:**\n\`\`\`yaml\n${schema.example}\`\`\`\n`;
    }
    return out;
  }

  const dir = path.join(ROOT, 'components');
  const available = fs.readdirSync(dir)
    .filter(n => fs.statSync(path.join(dir, n)).isDirectory())
    .sort()
    .join(', ');

  return `# build-plan.yaml — field reference
# Deploy with: deploy_site(site_name, build_plan_yaml)
# site_name must match slug (used as Cloudflare Pages project name + SITES_DIR folder)

slug: my-site              # lowercase letters, numbers, hyphens only; must match site_name arg
name: My Site              # display name shown in nav and browser title
overview: One sentence describing the site and its purpose.
style: minimal             # minimal | professional | bold
tone: professional         # professional | casual | technical | friendly
custom_domain: ""          # optional hostname only; e.g. www.example.com

head:                       # optional site-wide metadata defaults
  description: A concise page description.
  image:
    src: /assets/share.png  # root-relative path or absolute https:// URL
    alt: Description of the sharing image

pages:
  - id: home               # unique identifier; the page with id "home" maps to /
    title: Home            # shown in browser tab and nav
    head:                   # optional page-level metadata overrides
      description: A page-specific description.
    components:            # list of component objects stacked vertically on the page
      - type: <component-type>
        # Available types: ${available}
        # Call get_schema(component_name) for the full sub-schema and example of each type.

nav:
  order:                   # page ids in display order; must reference valid page ids
    - home
  show_contact_link: true  # optional: show contact link in footer (default: false)

contact:
  enabled: true            # whether to show contact info in footer
  email: hello@example.com # footer contact email (used for mailto: link)

headers:                    # optional Cloudflare Pages static response headers
  - path: /*
    values:
      X-Content-Type-Options: nosniff
`;
}

module.exports = { BUILD_SCRIPTS, listComponents, getSchema, stripAnsi, extractUrl, deploySite };
