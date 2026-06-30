---
type: Guide
title: Clodsite Agent Guide
description: Canonical, agent-neutral guidance — the workflow contract, architecture boundary, and multi-agent coordination norms.
tags: [agents, workflow, canonical]
timestamp: 2026-06-28T00:00:00Z
---

# Clodsite — Agent Guide

Canonical, agent-neutral guidance for any coding agent (Claude Code, Codex, or
others) working in this repository. This is the single source of truth.

> **Claude Code:** `CLAUDE.md` is a pure pointer to this file (its content lives
> only here). Claude Code also exposes the workflows below as slash commands
> (`/setup`, `/deploy`, …); those command files are thin triggers — the behavior
> lives here.
>
> **Other agents:** there are no slash commands. Run the workflows below by
> invoking the scripts directly, in the documented order.

Describe your site. Deploy it. Inference on the front end, deterministic scripts
on the back end — `build-plan.yaml` is the boundary between the two.

## Quick Start

| Step | Action | Result |
|------|--------|--------|
| 1 | **Setup** — verify Cloudflare token (run once) | `.env` |
| 2 | Create `$SITES_DIR/<site-name>/build-plan.yaml` | the build contract |
| 3 | **Build** — render templates + Eleventy build | `$SITES_DIR/<site-name>/dist/` |
| 4 | **Deploy** — ship to Cloudflare Pages | live URL |

Preview locally without deploying (no token needed): the **Deploy** workflow in
`local` mode. `SITES_DIR` defaults to `sites/`; set it in `.env` to keep site
state in a separate private repo. **Requirements:** Node.js 18+, Wrangler
(`npm install -g wrangler`), a Cloudflare account (free tier OK).

The core model: collaborate until `build-plan.yaml` is valid and approved, then
build and deploy. `/interview` (the **Interview** workflow) is an optional
guided way to produce the plan, not a requirement.

## Which guide do you need?

- **Changing Clodsite itself** (scripts, schemas, components, themes, docs,
  tests, deploy behavior): read [`docs/agent-development.md`](docs/agent-development.md).
- **Using Clodsite to build or modify a site**: read
  [`docs/agent-authoring.md`](docs/agent-authoring.md) and
  [`components/CATALOG.md`](components/CATALOG.md).
- Reference docs are indexed in [`docs/README.md`](docs/README.md).
- Clodsite knowledge follows the **Open Knowledge Format** —
  [`docs/knowledge/index.md`](docs/knowledge/index.md) defines the type
  vocabulary and frontmatter contract. Read it before creating or editing specs,
  plans, or reference docs.
- `ROADMAP.md` is the prioritized "what's done / what's next" — the shared
  current-state doc.

## Architecture: `[SCRIPT]` / `[LLM]` / `[HYBRID]`

Every workflow step below is labeled with its execution type:

| Label | What it means | Why it matters |
|-------|---------------|----------------|
| `[SCRIPT]` | Deterministic bash — same result every time | Free, fast, reliable |
| `[LLM]` | Agent inference — reasoning, generation, interpretation | Where creativity earns its cost |
| `[HYBRID]` | Script validates structure; agent handles semantics | Best of both |

The agent handles: collecting user input through chat, reading source material,
synthesizing structured site content into `build-plan.yaml`, and interpreting
errors. Everything after a valid `build-plan.yaml` is a script.

The inference boundary is `$SITES_DIR/<site-name>/build-plan.yaml`. Everything
before it is customer-agent collaboration; everything after it is deterministic
scripts.

---

# Workflows

Each workflow lists its trigger (the Claude Code slash command and the arguments
it accepts) and the agent-neutral steps. Run the scripts in order. When a step
is `[LLM]`/`[HYBRID]`, apply judgment as described.

## Setup

**Trigger:** `/setup`, `/setup clean`, `/setup clean <site-name>`. Collect and
verify Cloudflare credentials, write `.env`, and optionally clean prior build
artifacts.

The normal token requires **Cloudflare Pages: Edit**. Additionally:
- **Account > Workers KV Storage: Edit** — sites with live commerce checkout
  (deployment provisions the ORDERS KV namespace that backs webhook idempotency).
- **Account > Turnstile: Edit** — sites using `resend-form` with `turnstile: true`.
- **Zone > DNS: Edit** — optional, lets the Domain workflow create CNAMEs
  automatically (without it, it prints the record to add manually).

Builds remain offline; Turnstile and KV resources are created or reused at deploy
time. An existing token can be edited in place to add a missing permission — the
token string does not change, so `.env` stays as-is.

Steps:

1. **[SCRIPT]** If cleaning: `bash scripts/check-artifacts.sh`. `NO_ARTIFACTS`
   → nothing to clean. `ARTIFACTS_FOUND` (+ slugs) → ask which site, then
   `bash scripts/clean.sh <site-name>`. (`/setup clean <site-name>` cleans
   directly.) Then continue.
2. **[SCRIPT]** Detect prior builds: `bash scripts/check-artifacts.sh`. If
   artifacts are found, offer keep-or-clean before continuing.
3. **[SCRIPT]** `bash scripts/setup.sh --check` (wrangler installed?). Resolve
   any error before continuing.
4. **[SCRIPT]** `bash scripts/setup.sh --verify`. **Exit 0** → a valid token
   already exists; setup is complete, stop here, do not ask for a token.
   Non-zero → continue.
5. **[LLM]** Ask the user for their Cloudflare **API token** and **Account ID**
   (32-char hex from the dashboard URL), citing the permissions above.
6. Write `.env`:
   - **Shortcut:** if the user points to a credentials file, import it with
     `bash scripts/setup.sh --import <path>` — do **not** open or echo the file.
   - If credentials were pasted into chat, write them with your file-writing
     tool. Preserve any existing `SITES_DIR=` line. Format (no quotes, no extra
     lines):
     ```
     CLOUDFLARE_API_TOKEN=<token>
     CLOUDFLARE_ACCOUNT_ID=<account-id>
     # Optional:
     # SITES_DIR=/absolute/path/to/clodsite-sites
     ```
   - For multiple trusted local checkouts, prefer one shared private file and
     symlink each checkout's `.env` to it (`~/.config/clodsite/env`, `chmod 600`).
     See [Secrets & the shared env registry](#secrets--the-shared-env-registry).
7. **[SCRIPT]** `bash scripts/setup.sh --verify` (confirm). On failure, tell the
   user the token failed and to check **Pages: Edit** (and optionally DNS: Edit).
8. **[SCRIPT]** `bash scripts/setup.sh --init-sites` (initialize `SITES_DIR` as a
   git repo). When both succeed, tell the user they can create
   `$SITES_DIR/<site-name>/build-plan.yaml` and run **Build**.

**Secret-handling rule (all agents):** never display a full token or account ID
in chat or tool previews. When confirming, mask: first 6 chars, `…`, last 3
(e.g. `cfut_p1…b66`).

## Interview *(optional)*

**Trigger:** `/interview <site-name>`. A guided discovery session that ends in a
complete, validated `build-plan.yaml`. Not required — an agent may produce the
plan directly from a brief, source docs, existing copy, or conversation. Be
conversational and efficient; ask one question at a time.

1. **Get the site name** from the argument. Require a valid slug (lowercase
   letters, numbers, hyphens). If missing, ask for `/interview <site-name>` and
   stop. Suggest a slugified form if the user gave spaces/capitals.
2. **[SCRIPT]** Confirm the site doesn't exist:
   ```bash
   SITE_NAME=<site-name> bash -c 'source scripts/lib/sites.sh && clodsite_init_site_dir && [ ! -d "$SITE_DIR" ] || echo "EXISTS"'
   ```
   If `EXISTS`, tell the user to edit the existing plan, run **Build**, or
   `/setup clean <site-name>` to start over; stop.
3. **[SCRIPT]** Create the dir:
   ```bash
   SITE_NAME=<site-name> bash -c 'source scripts/lib/sites.sh && clodsite_init_site_dir && mkdir -p "$SITE_DIR/assets/favicons"'
   ```
   **Shortcut:** if the user points to an answers file, read it and synthesize
   the plan directly — skip the interactive questions.
4. **[LLM]** Ask, in order (site name is known — skip Q1): (2) one-sentence
   purpose; (3) audience; (4) tone — professional/casual/technical/friendly;
   (5) visual personality — minimal/professional/bold; (6) 1–5 page names;
   (7) one-line purpose per page; (8) copy provided or draft; (9) the copy or a
   description per page; (10) footer contact email (yes/no + address);
   (11) optional custom domain.
5. **[SCRIPT]** `bash scripts/generate-catalog-md.sh`, then **[LLM]** read
   `components/CATALOG.md`. Use **only** component types listed there —
   `validate-plan.sh` rejects unknown types.
6. **[LLM] Confirm before writing.** Summarize display name, slug, style, tone,
   page list with one-line purposes, nav order, and contact setting. Get
   confirmation.
7. **[LLM]** Write `$SITES_DIR/<site-name>/build-plan.yaml` per the schema and
   rules in [Authoring `build-plan.yaml`](#authoring-build-planyaml). Write only
   YAML — no fences, no explanation.
8. **[SCRIPT]** `SITE_NAME=<site-name> bash scripts/validate-plan.sh`. On errors,
   print them, fix the plan directly, re-run. Do not proceed until valid.
9. Tell the user to review the plan, then run **Build** (or **Deploy**).

## Build

**Trigger:** `/build <site-name>`. Render the plan to templates, run Eleventy,
produce `dist/`. All content comes from `build-plan.yaml` — no content decisions
happen here. If no site name, ask and stop.

1. **[SCRIPT]** `SITE_NAME=<site-name> bash scripts/validate-plan.sh` — on
   errors, print and stop; fix the plan, re-run.
2. **[SCRIPT]** `SITE_NAME=<site-name> bash scripts/write-site-json.sh`
3. **[SCRIPT]** `SITE_NAME=<site-name> bash scripts/apply-theme.sh`
4. **[SCRIPT]** `SITE_NAME=<site-name> bash scripts/render-templates.sh` — emits
   one `.njk` per page into `src/`, including the right component templates.
5. **[SCRIPT]** `SITE_NAME=<site-name> bash scripts/build-site.sh` — Eleventy. On
   error, show output. Common causes: malformed Nunjucks, missing layout, empty
   `dist/`. Fix template(s) and re-run.
6. **[SCRIPT]** `SITE_NAME=<site-name> bash scripts/render-headers.sh` — writes
   `dist/_headers` when the plan has header rules, else removes a stale file.

(The full **Deploy** pipeline also renders Functions and `_redirects`; see below.)

## Deploy

**Trigger:** `/deploy <site-name>`, `/deploy <site-name> local`,
`/deploy <site-name> "<message>"`. Always rebuilds first — builds are fast and
deploying a stale `dist/` is never wanted. Use **Build** to inspect the artifact
without publishing. Extract the site name (first word that isn't `local`) and an
optional message. If no site name, ask and stop.

**Local preview** (`local`): **[SCRIPT]** `SITE_NAME=<site-name> bash
scripts/deploy.sh --local` — builds and serves at `http://localhost:8080`, no
token needed. Stop here; do not run the Cloudflare steps.

**Cloudflare deploy:**
1. **Determine the deploy message** — it becomes the sites-repo commit subject
   `deploy: <site-name> — <message>` (URLs and Stripe mode go in the body). Use
   the user's message verbatim, or write a short reason yourself (e.g.
   `"first deploy"`, `"switch to Stripe live keys"`). Avoid bare
   `deploy: <site-name>` lines.
2. **[SCRIPT]** `bash scripts/build-deploy.sh <site-name> "<message>"` — the full
   pipeline: validate → build → render Functions/headers/redirects → deploy →
   finalize (prints the production URL, writes `NEXT-STEPS.md`, regenerates the
   site's OKF `Site` concept at `docs/index.md`, commits inside the `SITES_DIR`
   repo). For a `resend-form` with `turnstile: true`, deployment
   creates or reuses a managed Turnstile widget restricted to the site's
   production hostnames, installs its secret, and injects the site key.
3. **[LLM]** On non-zero exit, the failing stage is announced with `==>`; if the
   deploy stage failed, read `$SITES_DIR/<site-name>/.deploy-error`. Explain
   what went wrong and exactly how to fix it. Do **not** auto-retry. Common
   cases:
   - **Plan validation failed** — error names the field; fix the plan, re-deploy.
   - **Auth error** — token expired or missing a permission; re-run **Setup** or
     add the named permission (commerce → KV Storage: Edit; protected forms →
     Turnstile: Edit).
   - **Project name conflict** — a Pages project with this slug exists under a
     different account; change `slug`, re-deploy.
   - **Wrangler not found** — `npm install -g wrangler`.
4. On exit 0, finalize already ran — report the production URL and point at
   `$SITES_DIR/<site-name>/NEXT-STEPS.md`.

> **Deploying a live store:** `/deploy` reprovisions a live store's Stripe to
> match the `STRIPE_SECRET_KEY` mode in `.env`. Check the mode before deploying
> to a live site.

## Domain

**Trigger:** `/domain <site-name>`. Connect a custom domain to a deployed site.
If no site name, ask and stop.

1. **[LLM]** Read `$SITES_DIR/<site-name>/build-plan.yaml`. If `custom_domain`
   is empty/omitted, ask for the hostname (no protocol/path) and write it to the
   plan, leaving other fields unchanged. Never write deployment URLs into the
   plan — the `*.pages.dev` URL is read from Cloudflare at script time. If the
   site isn't deployed yet, tell the user to run **Deploy** first; stop.
2. **[SCRIPT]** `SITE_NAME=<site-name> bash scripts/domain.sh`
3. **[LLM]** Interpret output: `✓ CNAME created` → live in ~1 min, SSL auto;
   `✓ CNAME already exists` → already wired; `Add this record at your DNS
   provider` → present the CNAME clearly (include the automation note if shown).
   Common errors: token not set → **Setup**; `custom_domain not set` → add it;
   `Pages project not found` → **Deploy** first; HTTP 4xx on association → check
   the project name matches `slug`, re-deploy if it was deleted.

## Teardown

**Trigger:** `/teardown <site-name>`, `/teardown <site-name> clean`. Delete a
deployed site from Cloudflare Pages. Requires explicit confirmation. If no site
name, ask and stop.

1. **[LLM]** Read the plan, build a destruction summary (Pages project `slug`;
   live URL from Cloudflare if available; custom domain only if set). Show it and
   require the user to type the exact site name to confirm. If it doesn't match,
   cancel and stop.
2. **[SCRIPT]** `SITE_NAME=<site-name> bash scripts/teardown.sh`
3. **[SCRIPT]** Only if `clean` was passed: `bash scripts/clean.sh <site-name>`
4. **[LLM]** Interpret output: `✓ Deleted Pages project` → confirm offline; note
   whether local files were removed (`clean`) or remain. Common errors: token not
   set → **Setup**; "project not found" → may already be deleted (check
   `wrangler pages project list`).

## Status

**Trigger:** `/status`. **[SCRIPT]** `bash scripts/status.sh` — cross-references
local sites against live Cloudflare Pages state: production URL, custom domain,
last deploy timestamp per site; flags local sites with no live project as "not
deployed"; lists Pages projects outside `SITES_DIR` as a footer.

## Orders

**Trigger:** `/orders [site]`. **[SCRIPT]** `bash scripts/orders.sh [site]` — a
**read-only** audit of commerce fulfillment state. Lists each commerce site's
`ORDERS` KV records grouped by state and **highlights `failed` and stale
`processing`** orders; pass a site slug to narrow the report. Reads KV via the
Cloudflare API (needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`); never
calls Stripe or fulfillment providers and never writes. Use it to answer "is
anything stuck?" between deploys. (Stripe⇄KV reconciliation — catching paid
sessions with *no* KV record — is a separate effort; see
[`docs/superpowers/specs/2026-06-29-fulfillment-observability-design.md`](docs/superpowers/specs/2026-06-29-fulfillment-observability-design.md).)

---

# Authoring `build-plan.yaml`

Detailed contract: [`docs/authoring-build-plan.md`](docs/authoring-build-plan.md).
Component vocabulary: [`components/CATALOG.md`](components/CATALOG.md) (generated;
run `bash scripts/generate-catalog-md.sh` to refresh). Read the catalog before
constructing component arrays — use its constrained patterns rather than
inventing layout fields or raw HTML:

- `hero` opens a page and must be its first component; at most one per page.
- `feature-grid` explains two to six features or benefits.
- `key-facts` presents two to six scannable values.
- `quote` renders one plain-text quotation with attribution.
- `resource-cards` presents one to six actionable resources.
- `call-to-action` asks for one focused next step with one or two actions.

Actions accept only `label`, safe `href`, and optional `style:
primary|secondary`. The build plan does not control columns, colors, alignment,
spacing, or breakpoints. The default component is `prose` (GFM markdown).

Keep ordinary customer sites fixed-theme. Only when the user asks for a live
theme comparison, opt in explicitly:

```yaml
style: bold
theme_selector:
  enabled: true
  options: [minimal, professional, bold, warm]
```

The canonical lookbook site is `$SITES_DIR/clodsite-demo`.

The plan schema (see Interview Q&A and `docs/authoring-build-plan.md` for full
detail): `slug`, `name`, `overview`, `style`, `tone`, `custom_domain` (hostname
only, or `""`), optional `head` (default `description`/`image`), `pages[]` (each
with `id`, `title`, optional `head`, `components[]`), `nav.order` (must list
every page id), `contact` (`enabled`; `email` only when enabled), optional
`headers`. Page ids are lowercase, hyphenated. Plans contain no secrets, provider
responses, generated URLs, or raw styling knobs.

# Files Written During a Run

| File | Written by | Purpose |
|------|-----------|---------|
| `.env` | Setup | Cloudflare credentials |
| `$SITES_DIR/<site-name>/build-plan.yaml` | agent or Interview | Build contract: name, slug, style, content, metadata, headers, pages, nav, contact, optional custom domain, typed component arrays |
| `$SITES_DIR/<site-name>/src/_data/site.json` | Build | Structural Eleventy data (gitignored) |
| `$SITES_DIR/<site-name>/src/*.njk` | Build (render-templates) | Page templates (gitignored) |
| `$SITES_DIR/<site-name>/dist/` | Build | Built static site |
| `$SITES_DIR/<site-name>/dist/_headers` | Build (render-headers) | Optional Pages response-header rules |
| `$SITES_DIR/<site-name>/dist/_redirects` | Deploy (render-redirects) | Optional Pages redirect rules |
| `$SITES_DIR/<site-name>/NEXT-STEPS.md` | Deploy | Post-deploy ops guide |
| `$SITES_DIR/<site-name>/docs/index.md` | Deploy (regenerated) | OKF `Site` concept for the site's doc bundle |

# Scope (v2.0)

Static content sites, 1–5 pages (or one), built-in visual styles, `mailto:`
contact, Cloudflare Pages deploy, custom domain automation, per-site version
control. See `ROADMAP.md` for what's next. Original v1 spec:
[`docs/superpowers/specs/2026-05-13-clodsite-prd.md`](docs/superpowers/specs/2026-05-13-clodsite-prd.md).

---

# Working alongside other agents

Multiple agents work on Clodsite (Claude, Codex, and possibly others), each in
its **own checkout**. They cannot see each other's working tree. Alignment is
maintained through what is written down and shared, not through anything in any
one agent's head.

## Coordination checklist

Before starting Clodsite work:

- Pull `origin/main`.
- Check `ROADMAP.md`, especially `In Flight`, for active or recently completed
  work.
- State whether you are acting as a **development agent** (changing Clodsite) or
  an **authoring agent** (using Clodsite to modify a site). If the request spans
  both, say so and keep the two scopes separate.
- Use a short topic branch for implementation work, and keep ordinary work
  increments small enough to complete through one PR.
- If the change teaches a durable rule, update this file or the nearest relevant
  doc in the same PR.
- If the change affects shared behavior, update or add tests in the same PR.

- **Durable, shared truth lives in git.** This file, `docs/`, `ROADMAP.md`, and
  the code are the shared brain. If a fact must be true for every agent, it
  belongs here or in `docs/` — not in one agent's private memory or a past
  conversation.
- **Promote knowledge down into the repo.** When the user states a durable
  decision, write it into the relevant doc so the *other* agents learn it too:
  `AGENTS.md` for workflow rules, `docs/agent-development.md` for Clodsite
  implementation guidance, `docs/agent-authoring.md` for site-authoring
  behavior, and `ROADMAP.md` for planned or completed product direction. Treat
  per-agent private memory as scratch.
- **The remote is the coordination bus.** Pull before starting work; you only see
  another agent's changes once they are merged. Never assume uncommitted work in
  another checkout exists.
- **Keep `ROADMAP.md` current** as the shared "what's done / in flight" so agents
  don't collide or duplicate.

## Agent handoffs

When one agent leaves work for another, record enough context for a clean pickup
in the PR description, `ROADMAP.md`, or the relevant spec/plan:

```md
Context:
Decision:
Branch or PR:
Files likely affected:
Tests to run:
Deployment impact:
Open questions:
```

Clear handoffs are especially important when design and implementation are split
across agents, or when a site-specific request also requires a Clodsite product
change.

# Git & change rules

- `main` is protected. Do not commit implementation work directly to `main`
  unless the user explicitly asks — branch and open a PR.
- Branch names should be short and descriptive. Prefer prefixes that reveal the
  worker or scope, such as `codex/<topic>`, `claude/<topic>`, or `docs/<topic>`.
- Keep edits small and documented; do not revert the user's changes.
- Keep generated files, secrets, logs, and local runtime state out of commits.
- When instructions become durable, update this file or the nearest relevant doc.

# Secrets & the shared env registry

Credentials live in `.env`, which is gitignored. Across trusted local checkouts,
`.env` is a symlink to a single shared registry at `~/.config/clodsite/env`
(`chmod 600`); both Clodsite checkouts point at it, so every site's credentials
have one source of truth. `build-plan.yaml` references credential **names**, never
values. Never commit `.env`, never paste a secret into chat, and mask any token
shown for confirmation (see the Setup secret-handling rule).
