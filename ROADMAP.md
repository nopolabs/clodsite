# Clodsite Roadmap

Clodsite v1 is intentionally scoped: a static content site, 1–5 pages, three
visual styles, deployed to Cloudflare Pages. Items below were deliberately
deferred to keep the workflow shippable and honest. The near-term product focus
is making Clodsite better at building targeted informational websites: sites
that are discoverable, communicate a clear message, and improve through a
deliberate review cycle.

---

## Pending

Items are ordered by proposed implementation priority.

### 1. Commerce v1 — sell a small catalog of products

Add ecommerce as a Clodsite capability: a `catalog` component with
customer-requested size guides, site-level cart chrome (lookbook / preview /
live activation states), Stripe Checkout via generated Pages Functions, and a
fulfillment provider abstraction proven by shipping two providers (`printful`
and `manual` email fulfillment). Catalog data is provider-synced, normalized,
and committed alongside mirrored assets, keeping builds offline and the
inference boundary intact. Webhook fulfillment runs a KV-backed order state
machine (`processing`/`completed`/`failed`) with automated Stripe-retry
recovery and stored diagnostics; human intervention remains the final tier.
Dogfood target is hmc-cycling.org, ported and cut over as the final phase.
Six PR-able phases; the first four need no Printful account. Partially
advances "General Pages Functions and secrets" below (per-component secrets,
`provision-kv`, `provision-stripe-webhook`). Design:
`docs/superpowers/specs/2026-06-10-commerce-design.md`.

### 2. Schema-driven validation for agent-native workflows

Migrate the imperative configuration validation logic in `validate-plan.mjs`
to a declarative JSON Schema standard. This structural shift aligns the
codebase with the core thesis of Clodsite as a deterministic compiler,
optimizing the workflow for autonomous AI agents and programmatic toolchains.

Key objectives:

* **Declare the contract:** standardize the `build-plan.yaml` structural
  syntax into a strict JSON Schema, explicitly codifying required nodes, data
  types, component types, and the commerce primitives now landing.
* **Streamline the toolchain:** replace hand-written JavaScript validation
  logic in the repository scripts with a lightweight, schema-compliant
  validator library (e.g., `ajv`), reducing codebase maintenance overhead.
* **Enable agent-native safety:** provide a machine-readable schema that
  external AI agents (Claude Code, Cursor, local LLMs via MCP) can ingest
  natively to guarantee syntactically valid YAML output before generation
  begins.
* **Enhance human DX:** expose the schema to standard IDE language servers
  for instant inline autocomplete, documentation tooltips, and real-time
  linting when writing plans by hand.

Cross-file checks that JSON Schema cannot express (nav/page cross-references,
catalog slug resolution, filesystem existence) remain as a thin imperative
layer on top of the schema.

### 3. Governed preview-and-revise workflow

Add a first-class workflow for previewing an existing site, collecting targeted
feedback, proposing a reviewable `build-plan.yaml` diff, and rebuilding only
after approval. Feedback may come from conversation, screenshots, or concrete
goals such as making the purpose clearer or the primary action more prominent.
This evolves the planned `/modify` command around current build-plan-first
usage, preserves stable page IDs, and keeps revision governed rather than
silently regenerating the site.

### 4. Generated not-found page

Generate a top-level `404.html` for every site, with useful navigation back to
known content. This disables Cloudflare Pages' implicit single-page-application
fallback, so unknown URLs return an honest `404` response instead of serving
the home page with `200`.

### 5. Explicit redirects

Add optional redirect declarations to `build-plan.yaml` and generate a
Cloudflare Pages `_redirects` file. Support intentional permanent redirects for
renamed or retired pages, while leaving genuinely unknown paths to the generated
404 page. Validate sources, destinations, status codes, duplicates, and
conflicts with generated page routes.

### 6. Installable skill/plugin packaging

Clodsite currently ships as a template repo: clone it, `cd` into it, and open
an agent there. Package Clodsite as an installable skill or plugin available
from any directory, removing the clone-and-`cd` bootstrap. Multi-site
workspaces and configurable `SITES_DIR` have cleared the original storage and
invocation blockers.

### 7. General Pages Functions and secrets

Generalize the function and secret pipeline beyond the specific
`resend-form` use case. Turnstile-protected contact forms now exercise widget
provisioning and secret installation, but arbitrary generated Functions and
per-component secrets are not yet expressible. BBPP remains the driving
example: authenticated proxying and a separate rendering/email service.

### 8. MCP HTTP transport

The MCP server currently supports stdio only. Add an authenticated HTTP
transport so Clodsite can run as a shared or hosted deployment service while
preserving the same `list_components` and `deploy_site` contracts.

### 9. Free-form legacy interview opener

Replace the fixed ten-question `/interview` sequence with one open prompt,
targeted follow-up questions for missing information, and a confirmation
summary before writing `site-spec.json`. Keep the fixed sequence as a fallback.
This is lower priority because direct collaboration on `build-plan.yaml` is now
the primary workflow and interview/spec is explicitly legacy scaffolding.

### 10. Root-page routing contract

Fix the current assumption that both the page with `id: home` and the first
page in `nav.order` map to `/`. Define one unambiguous root-page rule and reject
conflicting plans during validation. This remains low priority because all
current sites put `home` first.

---

## Completed

### Extracted embedded JavaScript from bash scripts ("extract, don't rewrite")

Shipped June 2026. Eight scripts that embedded JavaScript programs inside
`node -e "..."` strings now call real ESM modules under `scripts/lib/*.mjs`,
with arguments passed safely via `process.argv` instead of bash interpolation
into JS source. The bash entry points, CLI contract, and `[SCRIPT]`
architecture story are unchanged; the extracted JS is now visible to linters,
formatters, and unit tests. Extracted: `validate-plan`, `write-site-json`,
`generate-catalog-md`, `finalize-plan`, `write-spec`, `validate-spec`,
`migrate-plan-to-components`, `migrate-site` (as `spec-slug.mjs`). Pure-bash
orchestration scripts were left alone; the hybrid scripts (`domain`,
`teardown`, `provision-turnstile`, `deploy-finalize`) remain
convert-when-next-touched.

### Goal-oriented informational components

Shipped June 2026. Added six constrained communication components: `hero`,
`feature-grid`, `key-facts`, `quote`, `resource-cards`, and
`call-to-action`. Component schemas now support bounded arrays and safe href
validation, while page validation keeps heroes first and unique. All themes
share semantic component tokens and accessible focus behavior.

The optional site-wide theme selector supports approved built-in themes,
shareable `?theme=` URLs, and persisted visitor choice. The public component
lookbook at [demo.clodsite.com](https://demo.clodsite.com) exercises the full
catalog across minimal, professional, and bold without custom site CSS.

Specs:
`docs/superpowers/specs/2026-06-09-goal-oriented-components-design.md` and
`docs/superpowers/plans/2026-06-09-goal-oriented-components.md`.

### Metadata, sharing, and response headers

Shipped June 2026. Added optional site-wide `head` defaults and page-level
overrides for descriptions and social images. Clodsite now derives canonical
URLs from `custom_domain` and emits escaped description, Open Graph, Twitter
Card, and generic `WebSite`/`WebPage` JSON-LD metadata. A validated top-level
`headers` array generates Cloudflare Pages `dist/_headers`; policies remain
explicit, and Pages Functions continue to own their response headers.

Specs:
`docs/superpowers/specs/2026-06-09-metadata-sharing-headers-design.md` and
`docs/superpowers/plans/2026-06-09-metadata-sharing-headers.md`.

### Resend-backed contact form

Shipped June 2026. Added the `resend-form` catalog component, generated
Cloudflare Pages Function, Resend secret deployment, server-side field
validation, and client-side submission states. `mailto-form` remains available
as the zero-backend option.

Specs:
`docs/superpowers/specs/2026-06-02-resend-form-component-design.md` and
`docs/superpowers/plans/2026-06-02-resend-form-component.md`.

### Turnstile protection for `resend-form`

Shipped June 2026. `turnstile: true` adds a managed Cloudflare Turnstile widget
whose site key, production hostnames, and Pages secret are provisioned
automatically during deployment. The existing Pages Function validates
single-use tokens, action, and hostname before calling Resend. Build plans
contain no Cloudflare keys and local builds make no Cloudflare API calls.

Specs:
`docs/superpowers/specs/2026-06-08-resend-form-turnstile-design.md` and
`docs/superpowers/plans/2026-06-08-resend-form-turnstile.md`.

### Multi-site workspaces
Shipped May 2026. All commands require a `<site-name>` argument. Each site's
files live under `sites/<name>/` — specs, build plans, built output, and deploy
artifacts are all per-site and never shared.

### Configurable site storage (`SITES_DIR`)
Shipped June 2026. Site state can live outside the Clodsite repository in a
separate private workspace. `SITES_DIR` may be configured in `.env` or supplied
per command; relative paths resolve from the repository root. Scripts, tests,
and the MCP server share the same path-resolution contract.

### Per-site scaffold isolation
Shipped May 2026. Generated files (`src/_data/site.json`, `*.njk` templates)
are written to `sites/<name>/src/` rather than `scaffold/src/`. The `scaffold/`
directory is now read-only shared infrastructure: base layout, theme CSS,
favicon, and the Eleventy installation. Building one site never touches another.

### `/teardown` command
Shipped May 2026. Deletes the Cloudflare Pages project by name (read from the
spec). If the site has a custom domain configured, also deletes the CNAME record
from Cloudflare DNS. Requires explicit confirmation via `--yes`; deliberately
separate from `/setup clean` since destroying a live site is a different intent
from clearing local build artifacts.

### Per-site deploy output files
Shipped May 2026. Deploy output files (`.deploy-output`, `.deploy-error`,
`.deploy-exit`) live at `sites/<name>/` rather than `scripts/`. Each site's
deploy state is independent; re-running finalize always reads the correct output.

### Custom domain automation (`/domain`)
Shipped May 2026. Adds the Pages domain association via API and creates the
proxied CNAME automatically when the apex zone is in the same Cloudflare
account. Falls back to printing manual DNS instructions when DNS is external or
the token lacks `Zone > DNS: Edit`. Handles the HTTP 400 (not 409) Cloudflare
returns when a domain association already exists.

### Sites version control
Shipped May 2026. `/setup` initializes `sites/` as a git repository (idempotent).
`deploy-finalize.sh` auto-commits after each successful deploy with message
`deploy: <site-name> → <url>`. No remote management — add a remote and push manually.

### Structured build plan (`build-plan.json`)
Shipped May 2026. `/plan` now produces `sites/<name>/build-plan.json` — a
structured document with full per-page content written during inference. `/build`
reads the JSON and the LLM renders it into Nunjucks templates; no content
decisions happen at build time. `validate-plan.sh` guards the boundary before
`/build` runs. The inference boundary is `build-plan.json`: everything before it
decides, everything after renders. Existing `build-plan.md` files are not read
by the new pipeline — re-run `/plan <site-name>` to regenerate.

### Unified build contract (merge spec config into build-plan)
Shipped May 2026. `build-plan.json` is now the single input to `/build`.
The `site_name` field was renamed to `slug`; a `name` field (display name,
injected by `finalize-plan.sh` from `spec.site.name`) was added. `write-site-json.sh`
and `apply-theme.sh` now read from `build-plan.json` only; `site-spec.json` is
interview scratch-state that `/build` never touches. `validate-plan.sh` also
gained a cross-reference check: all IDs in `nav.order` must exist in `pages`.

### Deploy pipeline reads slug from build-plan.yaml
Shipped May 2026. `deploy.sh` and `deploy-finalize.sh` now read the project slug
directly from `build-plan.yaml` instead of `site-spec.json`. The `site-spec.json`
existence check in `deploy.sh` was replaced with a `build-plan.yaml` check.
The `deployed_url` write-back in `deploy-finalize.sh` was removed entirely — the
live URL is shown in the terminal and written to `NEXT-STEPS.md`. Sites built
from a hand-authored `build-plan.yaml` no longer need a `site-spec.json` at any
stage of the pipeline.

### GFM build-plan format (`build-plan.yaml`)
Shipped May 2026. `build-plan.json` was replaced by human-readable YAML. Page
content uses literal block scalars containing GitHub Flavored Markdown.
`js-yaml` parses the contract throughout validation, planning, build, deploy,
domain, teardown, status, and MCP workflows.

### The `/status` command
Shipped May 2026. A read-only `[SCRIPT]` command that cross-references local
`sites/` with live Cloudflare Pages state. For each site it shows the
production URL, custom domain (if any), and last deploy timestamp — pulled from
`wrangler pages project list --json` and matched against each site's
`build-plan.yaml`. Flags local sites with no live Cloudflare Pages project as
"not deployed". Lists any Cloudflare Pages projects that exist outside
Clodsite's `sites/` as a footer line. Accepts a `SITES_DIR` env override for
testability.

### Per-site assets + favicons (page-types slice 1)
Shipped May 2026. First slice of the **page-types extension track** —
extending `build-plan.yaml`'s expressive range so that sites like
`bigbeautifulpeaceprize.com` (forms, server functions, secrets) can
eventually be expressed. Replaced the `sites/<name>/images/` convention
with a single general `sites/<name>/assets/` folder; added a special
`assets/favicons/` subfolder that is filename-pattern-detected at build
time and produces `<link>` tags in `<head>`. Zero new build-plan schema —
the compiler scans the filesystem and populates `site.favicons[]` /
`site.has_custom_favicons` on `site.json`. `sites/anchovy` migrated as
part of the change. The scaffold `favicon.svg` remains the default when
a site has no custom favicons. Spec:
`docs/superpowers/specs/2026-05-31-static-assets-favicons-design.md`.

### Script-generated templates
Shipped May 2026. The `[LLM]` template-render step in `/build` is gone.
`scripts/render-templates.sh` reads `build-plan.yaml` and emits one `.njk`
file per page that `{% include %}`s component templates from `components/`.
`/build` is now fully `[SCRIPT]`. `acceptEdits` mode is no longer needed.
Depended on the component catalog (also shipped May 2026).

### Page-type / component catalog (v1)
Shipped May 2026. New top-level `components/` directory holds typed,
self-contained components: `component.njk` + `component.css` + `schema.json`
per entry. v1 ships three: `prose` (default GFM body), `gallery` (responsive
image grid, subsumes anchovy's hand-built CSS), `mailto-form` (client-side
contact form, no backend). `build-plan.yaml` pages are now
`components: [{ type, ... }, ...]` — the LLM at `/plan` time picks from
`components/CATALOG.md` (auto-generated from schemas) and cannot invent types
(`validate-plan.sh` rejects them). `build_notes` is removed. All five
existing sites migrated. Spec:
`docs/superpowers/specs/2026-05-31-component-catalog-design.md`.

### `media-section` component
Shipped June 2026. Added a constrained editorial component pairing one image
with one Markdown block in `image-left`, `image-right`, `image-above`, or
`image-below` layouts. Layouts stack in deterministic reading order on narrow
screens. Component schemas now support nested object validation, enums, and
non-empty strings. `danrevel.com` is the first production use.

Spec:
`docs/superpowers/specs/2026-06-07-media-section-component-design.md`.

### Clodsite MCP server (v1)
Shipped June 2026. Exposes the build + deploy pipeline as an MCP server
(`mcp/server.js` + `mcp/pipeline.js`). Two tools: `list_components` returns
the component catalog; `deploy_site` takes a site name and `build-plan.yaml`
content, runs the full build pipeline, and returns the live URL. Stdio
transport only; designed for HTTP transport in a future increment. Spec:
`docs/superpowers/specs/2026-06-02-clodsite-mcp-server-design.md`.

### Responsive navigation for narrow screens

Shipped June 2026. Below the shared narrow-screen breakpoint, all three themes
place the site name on its own row and wrap navigation links beneath it. Every
link remains accessible without horizontal page overflow, with no JavaScript or
menu-control state.

---

*v1 scope is defined in `docs/superpowers/specs/2026-05-13-clodsite-prd.md`.*
