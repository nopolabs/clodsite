# Clodsite MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Clodsite's build + deploy pipeline as an MCP server so external designer agents can build and deploy sites by passing a `build-plan.yaml`.

**Architecture:** Three layers — `mcp/server.js` handles MCP protocol, `mcp/pipeline.js` wraps bash scripts as JS async functions, `scripts/*.sh` remain unchanged. The pipeline module is transport-agnostic: it knows nothing about MCP or HTTP, takes plain arguments, returns plain JS objects.

**Tech Stack:** Node 20, `@modelcontextprotocol/sdk` (stdio transport), `node:test` for unit tests, existing bash scripts for build/deploy.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Modify | Add `@modelcontextprotocol/sdk` dependency + `test:mcp` script |
| `mcp/pipeline.js` | Create | Wraps bash scripts; exports `listComponents`, `deploySite`, `extractUrl`, `stripAnsi` |
| `mcp/pipeline.test.js` | Create | `node:test` unit tests for pipeline module |
| `mcp/server.js` | Create | MCP server — tool definitions, request handlers, stdio transport startup |

---

### Task 1: Add dependency and test script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package.json**

Replace the `package.json` contents with:

```json
{
  "name": "clodsite",
  "version": "1.0.0",
  "private": true,
  "description": "Script dependencies for Clodsite build pipeline",
  "scripts": {
    "test:mcp": "node --test mcp/pipeline.test.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "js-yaml": "^4.1.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: `node_modules/@modelcontextprotocol/sdk/` exists.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(mcp): add @modelcontextprotocol/sdk dependency"
```

---

### Task 2: pipeline.js — listComponents, extractUrl, stripAnsi

**Files:**
- Create: `mcp/pipeline.test.js`
- Create: `mcp/pipeline.js`

- [ ] **Step 1: Write failing tests**

Create `mcp/pipeline.test.js`:

```javascript
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listComponents, extractUrl, stripAnsi } = require('./pipeline.js');

test('listComponents returns CATALOG.md content', () => {
  const catalog = listComponents();
  assert.ok(catalog.includes('## prose'));
  assert.ok(catalog.includes('## gallery'));
  assert.ok(catalog.includes('## mailto-form'));
});

test('extractUrl returns URL from deploy-finalize stdout', () => {
  const stdout = [
    '╔══════════════════════════════════════════════╗',
    '║  Your site is live!                          ║',
    '║                                              ║',
    '║  https://rosa-florist.pages.dev              ║',
    '╚══════════════════════════════════════════════╝',
  ].join('\n');
  assert.equal(extractUrl(stdout), 'https://rosa-florist.pages.dev');
});

test('extractUrl returns null when no URL present', () => {
  assert.equal(extractUrl('build failed'), null);
});

test('stripAnsi removes ANSI escape sequences', () => {
  assert.equal(stripAnsi('\x1B[31mError: bad input\x1B[0m'), 'Error: bad input');
});

test('stripAnsi trims surrounding whitespace', () => {
  assert.equal(stripAnsi('  hello  '), 'hello');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:mcp
```

Expected: `Cannot find module './pipeline.js'`

- [ ] **Step 3: Create mcp/pipeline.js with the three utility exports**

Create `mcp/pipeline.js`:

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:mcp
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add mcp/pipeline.js mcp/pipeline.test.js
git commit -m "feat(mcp): pipeline utilities — listComponents, extractUrl, stripAnsi"
```

---

### Task 3: pipeline.js — deploySite

**Files:**
- Modify: `mcp/pipeline.test.js`
- Modify: `mcp/pipeline.js`

- [ ] **Step 1: Add failing test for deploySite error path**

First, update the `require` at the top of `mcp/pipeline.test.js` to add `deploySite`:

```javascript
const { listComponents, extractUrl, stripAnsi, deploySite } = require('./pipeline.js');
```

Then append the test:

```javascript
test('deploySite returns error shape when validate-plan fails', async () => {
  const result = await deploySite('__mcp-test__', 'not: valid: yaml: [[[');
  // Clean up before asserting so the directory is always removed
  const { rmSync } = require('fs');
  const { join } = require('path');
  rmSync(join(__dirname, '..', 'sites', '__mcp-test__'), { recursive: true, force: true });
  assert.equal(result.error, true);
  assert.equal(result.step, 'validate-plan');
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:mcp
```

Expected: `deploySite is not a function`

- [ ] **Step 3: Implement deploySite in mcp/pipeline.js**

Add the following to `mcp/pipeline.js` before the `module.exports` line:

```javascript
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
```

Update `module.exports` to:

```javascript
module.exports = { listComponents, stripAnsi, extractUrl, deploySite };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:mcp
```

Expected: 6 passing tests. The `deploySite` test cleans up `sites/__mcp-test__/` inline, so no manual cleanup is needed.

- [ ] **Step 5: Commit**

```bash
git add mcp/pipeline.js mcp/pipeline.test.js
git commit -m "feat(mcp): pipeline deploySite — sequential script execution with structured errors"
```

---

### Task 4: Create mcp/server.js

**Files:**
- Create: `mcp/server.js`

- [ ] **Step 1: Write a load test in pipeline.test.js**

Append to `mcp/pipeline.test.js`:

```javascript
test('server.js loads without throwing', () => {
  // Require server.js in a way that does not start the stdio transport.
  // server.js guards startup behind `require.main === module`, so requiring
  // it here only registers handlers and exports the server instance.
  const { server } = require('./server.js');
  assert.ok(server, 'server instance is exported');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:mcp
```

Expected: `Cannot find module './server.js'`

- [ ] **Step 3: Create mcp/server.js**

Create `mcp/server.js`:

```javascript
'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const pipeline = require('./pipeline.js');

const server = new Server(
  { name: 'clodsite', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_components',
      description:
        'Returns the Clodsite component catalog. Read this before authoring a build-plan.yaml to know which component types exist.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'deploy_site',
      description:
        'Build and deploy a site from a build-plan.yaml. Returns { url, site_name } on success or { error, step, message } on failure.',
      inputSchema: {
        type: 'object',
        properties: {
          site_name: {
            type: 'string',
            description:
              'Slug used as the directory name under sites/ and as the Cloudflare Pages project name. Must match the slug field in build-plan.yaml.',
          },
          build_plan_yaml: {
            type: 'string',
            description: 'Full contents of build-plan.yaml.',
          },
        },
        required: ['site_name', 'build_plan_yaml'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'list_components') {
    return {
      content: [{ type: 'text', text: pipeline.listComponents() }],
    };
  }

  if (name === 'deploy_site') {
    const { site_name, build_plan_yaml } = args;
    const result = await pipeline.deploySite(site_name, build_plan_yaml);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: result.error === true,
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { server };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:mcp
```

Expected: 7 passing tests.

- [ ] **Step 5: Commit**

```bash
git add mcp/server.js mcp/pipeline.test.js
git commit -m "feat(mcp): MCP server with list_components and deploy_site tools"
```

---

### Task 5: Register with Claude Code and smoke test

**Files:**
- Modify: `.claude/settings.json` (via `/update-config` or manual edit)

This task is manual verification. Requires Cloudflare credentials in `.env` and an existing valid build-plan.yaml to test with.

- [ ] **Step 1: Add MCP server to Claude Code settings**

Add to `.claude/settings.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "clodsite": {
      "command": "node",
      "args": ["mcp/server.js"],
      "cwd": "/Users/danrevel/dev/clodsite",
      "env": {}
    }
  }
}
```

The `env` block is empty because the server process inherits `.env` via the shell. If Claude Code does not inherit shell env, move credentials here explicitly:

```json
"env": {
  "CLOUDFLARE_API_TOKEN": "<from .env>",
  "CLOUDFLARE_ACCOUNT_ID": "<from .env>"
}
```

- [ ] **Step 2: Restart Claude Code and verify the server connects**

Restart Claude Code. Run:

```
/mcp
```

Expected: `clodsite` appears in the MCP server list with status `connected`.

- [ ] **Step 3: Smoke test list_components**

In a Claude Code session, ask Claude to call the `list_components` tool. Expected output: the contents of `components/CATALOG.md` listing `prose`, `gallery`, and `mailto-form` components.

- [ ] **Step 4: Smoke test deploy_site with an existing plan**

Pick an existing site (e.g. `anchovy`). Ask Claude to call `deploy_site` with `site_name: "anchovy"` and the contents of `sites/anchovy/build-plan.yaml` as `build_plan_yaml`. Expected: tool returns `{ "url": "https://anchovy.pages.dev", "site_name": "anchovy" }`.

- [ ] **Step 5: Update ROADMAP.md**

Add a new "Completed" entry above the Pending section:

```markdown
### Clodsite MCP server (v1)
Shipped June 2026. Exposes the build + deploy pipeline as an MCP server
(`mcp/server.js` + `mcp/pipeline.js`). Two tools: `list_components` returns
the component catalog; `deploy_site` takes a site name and `build-plan.yaml`
content, runs the full build pipeline, and returns the live URL. Stdio
transport only; designed for HTTP transport in a future increment. Spec:
`docs/superpowers/specs/2026-06-02-clodsite-mcp-server-design.md`.
```

- [ ] **Step 6: Commit**

```bash
git add ROADMAP.md .claude/settings.json
git commit -m "feat(mcp): register MCP server with Claude Code, update roadmap"
```