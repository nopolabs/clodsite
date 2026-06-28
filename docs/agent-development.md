# Agent Guide: Developing Clodsite

Use this guide when you are asked to change Clodsite itself: scripts, schemas,
components, themes, docs, tests, or deployment behavior.

## Current Truth Versus History

Current operating documents:

- [`AGENTS.md`](../AGENTS.md) — canonical agent guide: the workflow contract
  (Setup, Interview, Build, Deploy, Domain, Teardown, Status), architecture
  boundary, and multi-agent norms. (`CLAUDE.md` is a pure pointer to it; Claude
  Code slash commands are thin triggers over these workflows.)
- [`README.md`](../README.md) for product overview and setup.
- [`docs/agent-authoring.md`](agent-authoring.md) and
  [`docs/authoring-build-plan.md`](authoring-build-plan.md) for site-authoring
  behavior.
- [`components/CATALOG.md`](../components/CATALOG.md) for the generated component
  authoring contract.
- [`ROADMAP.md`](../ROADMAP.md) for prioritized future work.

Historical records:

- `docs/superpowers/specs/*.md`
- `docs/superpowers/plans/*.md`

Those dated documents explain why earlier decisions were made. They can be
useful context, but they are not automatically current instructions. Prefer the
code, tests, and current docs when they disagree.

## Development-Agent Startup

Before changing Clodsite itself, follow the coordination checklist in
[`AGENTS.md`](../AGENTS.md):

1. Pull `origin/main`.
2. Check `ROADMAP.md` for active `In Flight` work and nearby Pending items.
3. Work on a topic branch, not `main`.
4. Keep durable decisions in repo docs, not in a private chat transcript.

If a request crosses the product boundary — for example, a site needs behavior
that Clodsite cannot express yet — keep the site-authoring change and the
Clodsite capability change conceptually separate. It is fine for one PR to
include both only when the scope is small and the tests/docs make the product
change clear.

## Architecture Boundary

`build-plan.yaml` is the source language. Generated HTML, CSS bundles, Nunjucks
pages, Pages Functions, `_headers`, and `dist/` are compiler output.

When changing Clodsite, preserve this boundary:

- Authoring and inference produce or modify `build-plan.yaml`.
- Scripts validate, render, build, provision, and deploy.
- Components and themes own presentation.
- Plans should not contain secrets, provider responses, generated URLs, or raw
  styling knobs.

## Source Map

| Area | Files |
|---|---|
| Workflow contract | `AGENTS.md` (canonical; `CLAUDE.md` points to it) |
| Slash-command triggers | `.claude/commands/*.md` (thin pointers to `AGENTS.md` workflows) |
| Build/deploy scripts | `scripts/*.sh` |
| Shared JS libraries | `scripts/lib/*.mjs` |
| Component schemas/templates/styles | `components/<name>/schema.json`, `component.njk`, `component.css` |
| Generated component reference | `components/CATALOG.md` |
| Themes | `scaffold/src/css/themes/*.css`, `docs/THEMES.md` |
| Site skeleton | `scaffold/src/_includes/base.njk`, `scaffold/src/css/*` |
| Tests | `scripts/test/run-tests.sh`, `scripts/lib/*.test.mjs`, `mcp/*.test.js` |
| Current authoring docs | `docs/agent-authoring.md`, `docs/authoring-build-plan.md` |

## Local Credentials Across Worktrees

`.env.example` (repo root) is the annotated template for the credential
registry — copy it to `.env` and fill in values, or use it as the reference for
the shared file described below. It documents every recognized name and the
item-12 binding conventions; the `.env` it produces is gitignored.

The scripts expect a repo-local `.env`. For multiple local checkouts or
agent worktrees that share one trusted operator account, use one private file at
`~/.config/clodsite/env` and symlink each checkout's `.env` to it:

```bash
mkdir -p ~/.config/clodsite
cp /path/to/existing/clodsite/.env ~/.config/clodsite/env
chmod 600 ~/.config/clodsite/env
ln -sf ~/.config/clodsite/env /path/to/clodsite-worktree/.env
```

Do not paste secrets into chat or commit `.env`. This is a local single-operator
convenience, not a multi-customer isolation model.

The shared env is the operator credential set; individual sites choose provider
resources and credentials through validated plan fields. Do not put secret
**values** in `build-plan.yaml` or generated site files — only **names**.

### Per-site secret binding (item 12)

A site declares *which* env var supplies each credential, so two sites can use
different keys (or Stripe modes) without editing a shared file:

- `commerce.checkout.mode: test|live` selects `STRIPE_SECRET_KEY_{TEST,LIVE}`
  and binds it to the canonical `STRIPE_SECRET_KEY`. Mode is **declared, not
  derived**: the deploy verifies the resolved key's prefix matches the declared
  mode (via `clodsite_stripe_mode`) and rejects a mismatch.
- `commerce.printful.api_key_env: SOME_NAME` binds `SOME_NAME` →
  `PRINTFUL_API_KEY` for that store.
- `resend-form`'s `api_key_env` binds a source → `RESEND_API_KEY`; it is
  site-scoped (one `/api/contact` endpoint), so every form must agree.

Resolution happens in `clodsite_resolve_bindings`, called from the
`clodsite_init_site_dir` chokepoint — names only travel through the plan; values
stay in the env, and a declared binding overrides an ambient canonical value
while the source still honors caller-exported-wins. When nothing is declared the
canonical bare names are read straight from the env (single-tenant default).

**Rule:** any script that reads a Stripe/Printful/Resend credential must resolve
its site through `clodsite_init_site_dir` (which binds the canonical names)
before reading it — never read an ambient `STRIPE_SECRET_KEY`/`PRINTFUL_API_KEY`
without going through the chokepoint, or it may pick up the wrong site's key.
Existence and Stripe key-shape are enforced at the point of use; `validate-plan`
stays structural and secret-free. `source scripts/resolve-env.sh <site>`
resolves a site's bindings into the current shell and reports the source name +
mode (never the value). Hard isolation by provider account is the item 16
trust-boundary work, layered on top of this plumbing.

## Component Change Checklist

When adding or changing a component:

1. Update `components/<name>/schema.json`.
2. Update `components/<name>/component.njk`.
3. Update `components/<name>/component.css`.
4. Escape all user-authored text in templates unless the value is intentionally
   rendered Markdown or JSON-script-safe data.
5. Keep JavaScript scoped to the component instance. Use the existing
   `document.currentScript` pattern for inline component scripts.
6. Regenerate the catalog:

   ```bash
   bash scripts/generate-catalog-md.sh
   ```

7. Add or update validation/rendering tests.
8. Build a fixture site that uses the component.

Do not add ad hoc raw HTML or JavaScript escape hatches to `prose` to avoid
creating a component.

## Theme Change Checklist

When adding or changing a theme:

1. Update `scaffold/src/css/themes/<theme>.css`.
2. Ensure it defines the full theme variable contract from
   [`docs/THEMES.md`](THEMES.md).
3. Add or update font loading in `scaffold/src/_includes/base.njk`.
4. Update the valid style list in `scripts/lib/validate-plan.mjs`.
5. Update the valid style message in `scripts/apply-theme.sh`.
6. Update current docs that list valid themes.
7. Add test coverage so the theme is bundled/validated.

Themes should raise visual quality through curated tokens and site chrome, not
per-site CSS escapes.

## Verification

Run the narrowest useful checks first, then broaden when the change touches
shared behavior. For a fuller map of the test suite, fixtures, result format,
and where to add coverage, read [`testing.md`](testing.md).

Common checks:

```bash
node --test scripts/lib/*.test.mjs mcp/pipeline.test.js
bash scripts/test/run-tests.sh
```

For local verification of a real site build:

```bash
for s in validate-plan write-site-json apply-theme render-templates \
         render-functions build-site render-headers render-redirects; do
  SITE_NAME=<site-name> bash scripts/$s.sh || { echo "BUILD FAILED at $s"; break; }
done
```

For a real deployment, prefer the wrapper:

```bash
SITES_DIR=/path/to/clodsite-sites bash scripts/build-deploy.sh <site-name> "reason for deploy"
```

Do not manually run `deploy.sh` plus `deploy-finalize.sh` unless you are
debugging a failed deploy or intentionally running a partial pipeline.
`build-deploy.sh` runs the full deterministic sequence:

1. `validate-plan`
2. `write-site-json`
3. `apply-theme`
4. `render-templates`
5. `render-functions`
6. `build-site`
7. `render-headers`
8. `render-redirects`
9. `deploy`
10. `deploy-finalize`

`deploy-finalize.sh` writes `NEXT-STEPS.md` and auto-commits the deployed site
snapshot to the sites repo when `SITES_DIR` is a git repo. Treat that as part of
the deploy workflow, not as a separate manual cleanup step.

If `run-tests.sh` or a build needs dependencies in a fresh checkout, run
`npm install` in the repository root first.

## Documentation Expectations

Update current docs when behavior changes. Do not rewrite dated historical
specs/plans unless the task is explicitly to correct the historical record.

Use this rule of thumb:

- Current behavior changed? Update `AGENTS.md` (the workflow contract), README,
  authoring docs, catalog, or theme docs as appropriate. Edit workflow behavior
  in `AGENTS.md`, not in the thin `.claude/commands/*.md` triggers.
- Design rationale changed? Add or update a dated spec/plan.
- Roadmap priority changed? Update `ROADMAP.md`.
