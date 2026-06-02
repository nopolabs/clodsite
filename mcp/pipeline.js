'use strict';

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function listComponents() {
  return fs.readFileSync(path.join(ROOT, 'components', 'CATALOG.md'), 'utf8');
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

  const siteDir = path.join(ROOT, 'sites', siteName);

  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'build-plan.yaml'), buildPlanYaml, 'utf8');

  const scripts = [
    'validate-plan.sh',
    'write-site-json.sh',
    'apply-theme.sh',
    'render-templates.sh',
    'build-site.sh',
    'deploy.sh',
    'deploy-finalize.sh',
  ];

  const env = { ...process.env, SITE_DIR: siteDir };

  for (const script of scripts) {
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

function getSchema() {
  return `# build-plan.yaml — complete field reference
# Deploy with: deploy_site(site_name, build_plan_yaml)
# site_name must match slug (used as Cloudflare Pages project name + sites/ directory)

slug: my-site              # lowercase letters, numbers, hyphens only; must match site_name arg
name: My Site              # display name shown in nav and browser title
overview: One sentence describing the site and its purpose.
style: minimal             # minimal | professional | bold
tone: professional         # professional | casual | technical | friendly

pages:
  - id: home               # unique identifier; the page with id "home" maps to /
    title: Home            # shown in browser tab and nav
    components:
      - type: prose
        markdown: |
          ## Heading
          Body text. Supports GFM: headings, lists, links, bold, italic,
          inline code, blockquotes, tables, fenced code blocks.

  - id: gallery
    title: Gallery
    components:
      - type: prose
        markdown: |
          ## Gallery
      - type: gallery
        images:
          - { src: /assets/images/photo.jpg, alt: Description of photo }
          - { src: /assets/images/photo2.jpg, alt: Description, caption: Optional caption }

  - id: contact
    title: Contact
    components:
      - type: prose
        markdown: |
          ## Get in touch
      - type: mailto-form
        to: hello@example.com          # required: recipient email address
        subject: Message from my-site  # optional: pre-filled subject line
        submit_label: Send             # optional: button label (default: Send)
        fields:                        # required: at least one field
          - { name: name,    label: Your name,  type: text,     required: true }
          - { name: email,   label: Your email, type: email,    required: true }
          - { name: message, label: Message,    type: textarea, required: true }

nav:
  order:                   # page ids in display order; must reference valid page ids
    - home
    - gallery
    - contact
  show_contact_link: true  # optional: show contact link in footer (default: false)

contact:
  enabled: true            # whether to show contact info in footer
  email: hello@example.com # footer contact email (used for mailto: link)
`;
}

module.exports = { listComponents, getSchema, stripAnsi, extractUrl, deploySite };
