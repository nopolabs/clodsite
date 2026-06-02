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
    exec(`bash "${scriptPath}"`, { env }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

async function deploySite(siteName, buildPlanYaml) {
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
      return { url, site_name: siteName };
    }
  }
}

module.exports = { listComponents, stripAnsi, extractUrl, deploySite };
