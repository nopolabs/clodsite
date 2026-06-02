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

module.exports = { listComponents, stripAnsi, extractUrl };
