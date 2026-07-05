import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function authoredInputPaths(siteRel) {
  return [
    `${siteRel}/build-plan.yaml`,
    `${siteRel}/assets`,
    `${siteRel}/collections`,
  ];
}

export function isUnder(path, prefix) {
  return path === prefix || path.startsWith(prefix + '/');
}

export function isAuthoredInputPath(siteRel, path) {
  return authoredInputPaths(siteRel).some((prefix) => isUnder(path, prefix));
}

export function isDistPath(siteRel, path) {
  return isUnder(path, `${siteRel}/dist`);
}

export function isFunctionPath(siteRel, path) {
  return isUnder(path, `${siteRel}/functions`);
}

export function isGeneratedPath(siteRel, path) {
  return isDistPath(siteRel, path) || isFunctionPath(siteRel, path);
}

export function parsePorcelainZ(buffer) {
  const tokens = buffer.toString('utf8').split('\0').filter(Boolean);
  const entries = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const entry = tokens[i];
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    const parsed = { status, path };
    if (status.includes('R') || status.includes('C')) {
      i += 1;
      if (i < tokens.length) parsed.origPath = tokens[i];
    }
    entries.push(parsed);
  }
  return entries;
}

function dirtyPaths(entry) {
  return entry.origPath ? [entry.path, entry.origPath] : [entry.path];
}

export function dirtyOffenders(entries, siteRel, mode) {
  if (mode === 'baseline') return entries.flatMap(dirtyPaths);
  if (mode === 'report') {
    return entries
      .flatMap(dirtyPaths)
      .filter((path) => !isAuthoredInputPath(siteRel, path) && !isGeneratedPath(siteRel, path));
  }
  throw new Error(`unknown dirty mode: ${mode}`);
}

function runGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

export function collectNameStatus(root, paths) {
  const tracked = runGit(root, ['diff', '--name-status', 'HEAD', '--', ...paths])
    .split('\n')
    .filter(Boolean);
  const trackedPaths = new Set(tracked.map((line) => {
    const parts = line.split('\t');
    return parts[parts.length - 1];
  }));
  const untracked = runGit(root, ['ls-files', '--others', '--exclude-standard', '--', ...paths])
    .split('\n')
    .filter(Boolean)
    .filter((path) => !trackedPaths.has(path))
    .map((path) => `A\t${path}`);
  return [...tracked, ...untracked].join('\n');
}

export function routeForDistPath(siteRel, path) {
  const prefix = `${siteRel}/dist/`;
  if (!path.startsWith(prefix)) return null;
  const rel = path.slice(prefix.length);
  if (rel === 'index.html') return { kind: 'route', label: '/' };
  if (rel === '404.html') return { kind: 'route', label: '404 page' };
  if (rel === '_headers' || rel === '_redirects') return { kind: 'policy', label: rel };
  if (rel.endsWith('/index.html')) return { kind: 'route', label: `/${rel.slice(0, -'index.html'.length)}` };
  return { kind: 'asset', label: rel };
}

export function functionLabel(siteRel, path) {
  const prefix = `${siteRel}/functions/`;
  if (!path.startsWith(prefix)) return null;
  return path.slice(prefix.length);
}

export function parseNameStatus(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const parts = line.split('\t');
    const status = parts[0][0];
    const path = parts[parts.length - 1];
    return { status, path };
  });
}

function normalizeRoute(route) {
  return route.length > 1 && route.endsWith('/') ? route.slice(0, -1) : route;
}

export function redirectFroms(redirectsPath) {
  if (!redirectsPath || !fs.existsSync(redirectsPath)) return new Set();
  const froms = new Set();
  for (const line of fs.readFileSync(redirectsPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const from = trimmed.split(/\s+/)[0];
    if (from) froms.add(normalizeRoute(from));
  }
  return froms;
}

function statusLabel(status) {
  if (status === 'A') return 'added';
  if (status === 'D') return 'removed';
  return 'changed';
}

export function renderReport({ siteName, siteRel, authoredStatusText, distStatusText, functionStatusText, redirectsPath, title }) {
  const authored = parseNameStatus(authoredStatusText);
  const dist = parseNameStatus(distStatusText);
  const functions = parseNameStatus(functionStatusText);
  const redirects = redirectFroms(redirectsPath);
  const sections = {
    route: [],
    policy: [],
    asset: [],
  };

  for (const entry of dist) {
    const mapped = routeForDistPath(siteRel, entry.path);
    if (!mapped) continue;
    let warning = '';
    if (mapped.kind === 'route' && entry.status === 'D' && !redirects.has(normalizeRoute(mapped.label))) {
      warning = ' (WARNING: no redirect covers this removed route)';
    }
    sections[mapped.kind].push(`  ${entry.status} ${mapped.label} — ${statusLabel(entry.status)}${warning}`);
  }
  const functionLines = functions
    .map((entry) => {
      const label = functionLabel(siteRel, entry.path);
      if (!label) return null;
      return `  ${entry.status} ${label} — ${statusLabel(entry.status)}`;
    })
    .filter(Boolean);

  const lines = [title || `Revision report for ${siteName}`, ''];
  lines.push('Authored inputs:');
  if (authored.length === 0) {
    lines.push('  (none)');
  } else {
    for (const entry of authored) lines.push(`  ${entry.status} ${entry.path}`);
  }

  lines.push('', 'Routes:');
  lines.push(...(sections.route.length ? sections.route : ['  (none)']));
  lines.push('', 'Policy files:');
  lines.push(...(sections.policy.length ? sections.policy : ['  (none)']));
  lines.push('', 'Assets:');
  lines.push(...(sections.asset.length ? sections.asset : ['  (none)']));
  lines.push('', 'Functions:');
  lines.push(...(functionLines.length ? functionLines : ['  (none)']));
  return lines.join('\n') + '\n';
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'authored-inputs') {
    const [siteRel] = args;
    process.stdout.write(authoredInputPaths(siteRel).join('\n') + '\n');
    return;
  }
  if (command === 'dirty') {
    const [mode, siteRel] = args;
    const entries = parsePorcelainZ(fs.readFileSync(0));
    const offenders = dirtyOffenders(entries, siteRel, mode);
    if (offenders.length > 0) {
      process.stdout.write(offenders.join('\n') + '\n');
      process.exitCode = 1;
    }
    return;
  }
  if (command === 'status') {
    const [root, siteRel, kind] = args;
    let paths;
    if (kind === 'authored') {
      paths = authoredInputPaths(siteRel);
    } else if (kind === 'functions') {
      paths = [`${siteRel}/functions`];
    } else {
      paths = [`${siteRel}/dist`];
    }
    process.stdout.write(collectNameStatus(root, paths));
    return;
  }
  if (command === 'report') {
    const [siteName, siteRel, redirectsPath] = args;
    process.stdout.write(renderReport({
      siteName,
      siteRel,
      redirectsPath,
      title: process.env.REPORT_TITLE || '',
      authoredStatusText: process.env.AUTHORED_STATUS || '',
      distStatusText: process.env.DIST_STATUS || '',
      functionStatusText: process.env.FUNCTION_STATUS || '',
    }));
    return;
  }
  console.error('Usage: revise-report.mjs <authored-inputs|dirty|status|report> ...');
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
