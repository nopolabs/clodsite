# Clodsite

Describe your site. Deploy it. Inference on the front end, deterministic scripts on the back end — `build-plan.yaml` is the boundary between the two.

## Getting Started

When a user opens this project without a specific request, greet them with this:

---

👋 **Welcome to Clodsite.** Here's how to build your site:

| Step | Command | What it does |
|------|---------|--------------|
| 1 | `/setup` | Verify your Cloudflare token |
| 2 | Create `$SITES_DIR/<site-name>/build-plan.yaml` | Work with the AI agent however you like until the plan is complete |
| 3 | `/build <site-name>` | Generate templates + Eleventy build → `$SITES_DIR/<site-name>/dist/` |
| 4 | `/deploy <site-name>` | Ship to Cloudflare Pages → live URL |

Or to preview locally without deploying: `/deploy <site-name> local`

After deploying: `/domain <site-name>` to connect a custom domain, `/teardown <site-name>` to delete a Pages project.

`SITES_DIR` defaults to `sites/` and may be set in `.env` to point at a separate private sites repo. `/interview` and `/plan` still exist as legacy scaffolding commands, but they are not the core model. The core model is: collaborate until `build-plan.yaml` is valid and approved, then build and deploy.

Type `/help` at any time to see this again.

---

## Commands

### `/setup` — `[HYBRID]`
Collect and verify Cloudflare credentials. Write `.env`. Optionally clean previous build artifacts.

The normal token requires Cloudflare Pages edit access. Sites using
`resend-form` with `turnstile: true` also require
`Account > Turnstile > Edit`. Sites with live commerce checkout also require
`Account > Workers KV Storage > Edit` — deployment provisions the ORDERS KV
namespace that backs webhook idempotency. Builds remain offline; Turnstile
and KV resources are created or reused during deployment.

```
[SCRIPT] bash scripts/clean.sh               (only if user typed `/setup clean`)
[SCRIPT] bash scripts/check-artifacts.sh     (detect previous build in SITES_DIR)
[LLM]    Offer clean-or-keep if artifacts were found
[SCRIPT] bash scripts/setup.sh --check       (wrangler installed?)
[SCRIPT] bash scripts/setup.sh --verify      (skip the rest if .env already works)
[LLM]    Ask for Cloudflare API token + Account ID
[LLM]    Write .env via the Write tool
[SCRIPT] bash scripts/setup.sh --verify      (confirm)
[SCRIPT] bash scripts/setup.sh --init-sites  (initialize SITES_DIR as a git repo)
```

### `/interview` — `[LLM]` legacy scaffold
Guided interview session. Produces `$SITES_DIR/<site-name>/site-spec.json`. This was the original discovery path and remains useful as a structured fallback, but it is not required by the build pipeline.

```
[LLM]    Conduct interview, synthesize answers into JSON
[SCRIPT] bash scripts/write-spec.sh
```

### `/plan` — `[HYBRID]` legacy scaffold
Validate a legacy spec. Write all page content. Produces `$SITES_DIR/<site-name>/build-plan.yaml` — the actual inference boundary. Agents may also produce `build-plan.yaml` directly from a customer brief, notes, files, or an interactive conversation.

```
[SCRIPT] bash scripts/validate-spec.sh
[SCRIPT] bash scripts/generate-catalog-md.sh
[LLM]    Generate $SITES_DIR/<site-name>/build-plan.yaml (reads components/CATALOG.md for the component vocabulary)
[SCRIPT] SITE_NAME=<site-name> bash scripts/finalize-plan.sh
```

User reviews `$SITES_DIR/<site-name>/build-plan.yaml` before running `/build`.

### Component authoring

Read `components/CATALOG.md` before constructing component arrays. Use the
catalog's constrained communication patterns rather than inventing layout
fields or raw HTML:

- `hero` opens a page and must be its first component; at most one per page.
- `feature-grid` explains two to six features or benefits.
- `key-facts` presents two to six scannable values.
- `quote` renders one plain-text quotation with attribution.
- `resource-cards` presents one to six actionable resources.
- `call-to-action` asks for one focused next step with one or two actions.

Actions accept only `label`, safe `href`, and optional
`style: primary|secondary`. The build plan does not control columns, colors,
alignment, spacing, or breakpoints.

For a site-wide live comparison of built-in themes, opt in explicitly:

```yaml
style: bold
theme_selector:
  enabled: true
  options: [minimal, professional, bold]
```

Keep ordinary customer sites fixed-theme unless the user asks for a selector.
The canonical lookbook site is `$SITES_DIR/clodsite-demo`.

### `/build` — `[SCRIPT]`
Render build plan to templates. Run Eleventy. Produces `$SITES_DIR/<site-name>/dist/`. All content is read from `build-plan.yaml` — no content decisions happen here.

```
[SCRIPT] bash scripts/validate-plan.sh
[SCRIPT] bash scripts/write-site-json.sh
[SCRIPT] bash scripts/apply-theme.sh
[SCRIPT] bash scripts/render-templates.sh
[SCRIPT] bash scripts/render-functions.sh
[SCRIPT] bash scripts/build-site.sh
```

### `/deploy` — `[SCRIPT]`
Deploy to Cloudflare Pages. Produces a live URL and `$SITES_DIR/<site-name>/NEXT-STEPS.md`. For a `resend-form` with `turnstile: true`, deployment automatically creates or reuses a managed Turnstile widget, restricts it to the site's production hostnames, installs its secret, and injects its public site key. Use `/deploy <site-name> local` to preview at localhost:8080 instead of deploying.

```
[SCRIPT] bash scripts/deploy.sh --local      (if `/deploy <site-name> local` — serve, no deploy)
[SCRIPT] bash scripts/deploy.sh              (ensure Pages project; provision Turnstile when enabled; deploy)
[LLM]    Interpret error if deploy fails
[SCRIPT] bash scripts/deploy-finalize.sh     (on success — production URL, NEXT-STEPS.md)
```

### `/domain` — `[HYBRID]`
Connect a custom domain to a deployed site. Reads `slug` and `custom_domain` from `build-plan.yaml`, reads the deployed `*.pages.dev` URL from Cloudflare, creates the Pages association and proxied CNAME automatically when DNS is in the same Cloudflare account, and falls back to manual instructions otherwise.

```
[LLM]    Read build-plan.yaml, prompt for custom_domain if not already set
[SCRIPT] SITE_NAME=<site-name> bash scripts/domain.sh
[LLM]    Interpret output (CNAME created, already exists, or manual DNS instructions)
```

### `/teardown` — `[HYBRID]`
Delete a deployed site from Cloudflare Pages. Reads `slug` and `custom_domain` from `build-plan.yaml` and reads the deployed `*.pages.dev` URL from Cloudflare before deleting. Requires explicit confirmation. Optionally cleans local artifacts with `clean` flag.

```
[LLM]    Read build-plan.yaml, show destruction summary (project, URL, custom domain if set)
[LLM]    Ask user to type site name to confirm
[SCRIPT] SITE_NAME=<site-name> bash scripts/teardown.sh
[SCRIPT] bash scripts/clean.sh <site-name>   (only if `/teardown <site-name> clean`)
[LLM]    Interpret error if teardown fails
```

### `/status` — `[SCRIPT]`
Show the status of all Clodsite-managed sites, cross-referenced against live Cloudflare Pages state.

```
[SCRIPT] bash scripts/status.sh
```

---

## Architecture: `[SCRIPT]` / `[LLM]` / `[HYBRID]`

Every step is labeled with its execution type:

| Label | What it means | Why it matters |
|-------|---------------|----------------|
| `[SCRIPT]` | Deterministic bash — same result every time | Free, fast, reliable |
| `[LLM]` | Claude inference — reasoning, generation, interpretation | Where creativity earns its cost |
| `[HYBRID]` | Script validates structure; LLM handles semantics | Best of both |

The LLM handles: collecting user input through the chat, reading source material, synthesizing structured site content into `build-plan.yaml`, and interpreting errors. Everything after a valid `build-plan.yaml` is a script.

---

## Files Written During a Run

| File | Written by | Purpose |
|------|-----------|---------|
| `.env` | `/setup` | Cloudflare credentials |
| `$SITES_DIR/<site-name>/site-spec.json` | `/interview <site-name>` | Optional legacy discovery artifact |
| `$SITES_DIR/<site-name>/build-plan.yaml` | AI agent or `/plan <site-name>` | Contract for the build: display name, slug, style, content, metadata, response headers, pages, nav, contact, optional custom domain, and typed component arrays |
| `$SITES_DIR/<site-name>/src/_data/site.json` | `/build <site-name>` | Structural site data for Eleventy (gitignored) |
| `$SITES_DIR/<site-name>/src/*.njk` | `/build <site-name>` (via `render-templates.sh`) | Page templates with content (gitignored) |
| `$SITES_DIR/<site-name>/dist/` | `/build <site-name>` | Built static site |
| `$SITES_DIR/<site-name>/dist/_headers` | `/build <site-name>` (via `render-headers.sh`) | Optional Cloudflare Pages static response-header rules |
| `$SITES_DIR/<site-name>/NEXT-STEPS.md` | `/deploy <site-name>` | Post-deploy ops guide |

---

## Scope (v2.0)

Static content sites, 1–5 pages (or one), three visual styles, `mailto:` contact, Cloudflare Pages deploy, custom domain automation, per-site version control.

The inference boundary is `$SITES_DIR/<site-name>/build-plan.yaml`. Everything before it is customer-agent collaboration; everything after it is deterministic scripts.

See `ROADMAP.md` for what's next.
Original v1 spec: `docs/superpowers/specs/2026-05-13-clodsite-prd.md`.
