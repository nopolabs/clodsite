# Clodsite MCP Server — Design

**Date:** 2026-06-02
**Status:** Approved, ready for implementation plan
**Related roadmap entries:** "Installable skill packaging" (adjacent), "Contact form + form backend" (downstream beneficiary)

---

## Background

Clodsite today is a Claude Code skill set: a human opens the project, runs
`/interview`, `/plan`, `/build`, `/deploy` in sequence. The LLM is the
conductor; bash scripts are the workers.

The target model is different: a **designer agent** (built on the Claude API or
any LLM) conducts the conversation with a business owner, produces a
`build-plan.yaml`, and hands it to Clodsite to build and deploy. Clodsite
becomes a tool the designer agent calls — not an interface the human drives
directly.

The `[SCRIPT]` / `[LLM]` architecture boundary already anticipates this split.
`build-plan.yaml` is the inference boundary: everything before it is deciding
(the designer agent's job); everything after it is rendering (Clodsite's job).
The MCP server makes that boundary explicit and callable.

---

## Mental Model

```
Business owner  ←→  Designer agent (external LLM)
                           ↓  MCP tool calls
                     Clodsite MCP server
                           ↓
                     build + deploy scripts
                           ↓
                     Cloudflare Pages → URL
```

The designer agent owns: conversation, clarification, `build-plan.yaml`
authorship.

Clodsite MCP owns: execution — validate, build, deploy, return URL.

---

## Design

### 1. Architecture: three layers

```
Designer Agent (external)
        ↓  MCP tool calls (stdio transport, v1)
   mcp/server.js          ← tool definitions, input validation, response formatting
        ↓  JS function calls
   mcp/pipeline.js        ← wraps bash scripts, sequences steps, structures errors
        ↓  child_process.exec  (SITE_DIR=sites/<name>)
   scripts/*.sh           ← existing build/deploy pipeline, unchanged
        ↓
   sites/<name>/          ← filesystem state
        ↓
   Cloudflare Pages API
```

**`mcp/server.js`** — MCP protocol only. Defines tools, validates inputs,
formats tool responses. Never calls scripts directly.

**`mcp/pipeline.js`** — The adapter layer. Wraps bash scripts as JS async
functions. Handles subprocess execution, stdout/stderr capture, ANSI stripping,
and structured error returns. The pipeline module has no knowledge of MCP or
HTTP — it takes plain arguments and returns plain JS objects.

**`scripts/*.sh`** — Unchanged. The pipeline module calls them exactly as the
Claude Code skills do today, via `SITE_DIR=sites/<name>` env var.

New files:
```
mcp/
  server.js
  pipeline.js
```

The MCP server shares the root `package.json`. One new dependency:
`@modelcontextprotocol/sdk`.

### 2. Tool surface (incremental)

**v1 — Core loop**

| Tool | Inputs | Output |
|------|--------|--------|
| `list_components` | _(none)_ | Contents of `components/CATALOG.md` |
| `deploy_site` | `site_name` (string), `build_plan_yaml` (string) | `{ url, site_name }` |

`list_components` lets the designer agent learn the component vocabulary before
authoring a plan. `deploy_site` is the full pipeline: write plan → build →
deploy → return URL. Atomic from the caller's perspective.

**v2 — Operations**

| Tool | Inputs | Output |
|------|--------|--------|
| `get_status` | `site_name?` (string, optional) | deploy state for one or all sites |
| `teardown_site` | `site_name` (string) | confirmation message |

**v3 — Preview / promotion**

| Tool | Inputs | Output |
|------|--------|--------|
| `preview_site` | `site_name`, `build_plan_yaml` | `{ preview_url }` |
| `promote_to_production` | `site_name` | `{ url }` |

Each increment ships independently. v1 is sufficient for the designer-agent
loop.

### 3. Pipeline module: `deploy_site` flow

`deploySite(siteName, buildPlanYaml)` runs in sequence, stopping on first
failure:

1. Create `sites/<name>/` if it does not exist
2. Write `build-plan.yaml` to `sites/<name>/`
3. `validate-plan.sh`
4. `write-site-json.sh`
5. `apply-theme.sh`
6. `render-templates.sh`
7. `build-site.sh`
8. `deploy.sh`
9. `deploy-finalize.sh`
10. Grep `deploy-finalize.sh` stdout for `https://[a-zA-Z0-9-]+\.pages\.dev` to extract the production URL
11. Return `{ url, site_name }`

Each script is called with `SITE_DIR=sites/<name>` in the environment, matching
how the Claude Code skills invoke them today.

**`site_name` vs `slug`:** The `site_name` tool argument determines the
filesystem path (`sites/<name>/`). The `slug` field inside `build-plan.yaml`
determines the Cloudflare Pages project name — these are read by `deploy.sh`
independently. They should match; if they diverge, the site builds to the right
directory but deploys to a differently-named Pages project. The pipeline does
not enforce they match in v1 — that validation belongs in `validate-plan.sh` or
a future pipeline guard.

**Error shape** on any non-zero exit:
```json
{
  "error": true,
  "step": "validate-plan",
  "message": "<cleaned stderr — ANSI stripped, whitespace trimmed>"
}
```

The `message` field is suitable for the designer agent to relay to the business
owner or include in its own reasoning.

### 4. Credential handling

**v1 (stdio):** The MCP server process is launched with `.env` loaded
(configured in the MCP client's `env` block). Bash scripts read
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exactly as today. No changes
to credential handling.

**v2 (HTTP, future):** Per-request credential passing or per-user credential
storage — design deferred. The pipeline module interface does not need to
change; the HTTP transport layer handles injection.

### 5. HTTP-readiness

The pipeline module is transport-agnostic by construction. When HTTP transport
arrives, a new `mcp/http-server.js` wraps the same pipeline module:

```
stdio transport  →  mcp/server.js      ─┐
                                         ├─  mcp/pipeline.js  →  scripts/*.sh
HTTP transport   →  mcp/http-server.js  ─┘
```

`pipeline.js` and `scripts/*.sh` are not touched for the HTTP increment.

`deploySite` is synchronous in v1 (awaits completion before returning). For
HTTP, long-running builds will need a job/poll pattern — the HTTP server adds
that wrapper; the pipeline interface is unchanged.

### 6. MCP client configuration

To use the server from Claude Code or Claude Desktop, add to MCP settings:

```json
{
  "mcpServers": {
    "clodsite": {
      "command": "node",
      "args": ["mcp/server.js"],
      "cwd": "/path/to/clodsite",
      "env": {
        "CLOUDFLARE_API_TOKEN": "...",
        "CLOUDFLARE_ACCOUNT_ID": "..."
      }
    }
  }
}
```

---

## Deferred

- **HTTP transport** — v2. Requires job/poll pattern for long builds and a
  credential injection design for multi-tenant use.
- **`preview_site` / `promote_to_production`** — v3. Requires understanding
  Cloudflare Pages branch deploy API.
- **`get_status` / `teardown_site`** — v2. Thin wrappers over `status.sh` and
  `teardown.sh`; straightforward once v1 is running.
- **Multi-tenant credential management** — not designed. Depends on hosted
  deployment model (v2+).
- **MCP server packaging as installable plugin** — related to "Installable skill
  packaging" roadmap entry; out of scope here.
