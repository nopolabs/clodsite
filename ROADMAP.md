# Clodsite Roadmap

Clodsite v1 is intentionally scoped: a static content site, 1–5 pages, three
visual styles, deployed to Cloudflare Pages. Items below were deliberately
deferred to keep the workflow shippable and honest. The near-term product focus
is making Clodsite better at building targeted informational websites: sites
that are discoverable, communicate a clear message, and improve through a
deliberate review cycle.

---

## In Flight

Keep ordinary work increments small enough that they do not need to linger here:
a short-lived branch plus PR is usually enough. Use this section only for
larger, multi-step efforts with agreed milestones, or for active work another
agent should avoid overlapping. Remove entries promptly when merged, abandoned,
or moved into Pending/Completed.

- **OKF knowledge format adoption** (claude). Done: `AGENTS.md` + hand-authored
  `docs/` guides/references carry OKF frontmatter; `docs/knowledge/index.md`
  defines the contract; `scripts/lib/validate-okf.mjs` enforces conformance in
  the test suite; all dated `superpowers/specs|plans` records carry frontmatter
  with `status`/`supersedes`; `generate-catalog-md.sh` also emits an OKF
  `Component` bundle under `docs/knowledge/components/` (84 conformant, full
  coverage); `scripts/generate-site-docs.sh` writes a `Site` concept into each
  site's `docs/index.md` in the sites repo (offline from `build-plan.yaml`).
  Remaining: optional static visualizer. Avoid overlapping on `docs/knowledge/`
  and bulk frontmatter edits while this is in flight.

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

### 2. Customer order confirmation emails

Send a transactional confirmation to the customer after a paid order is
durably recorded. The message should include the order identifier, purchased
items and variants, totals, shipping address, and support contact, with a clear
distinction between payment confirmation and later fulfillment or shipping
updates. Delivery must be idempotent under Stripe webhook retries, record
diagnostics for failed sends, and avoid delaying or invalidating the paid order
when the email provider is unavailable. Decide during design whether this
supplements Stripe receipts or replaces them as the primary customer-facing
purchase confirmation.

### 3. Named commerce catalogs — multiple commerce components per site

Commerce v1 assumes one catalog per site: a single `commerce/catalog.json`,
one fulfillment provider, and `catalog` components that filter it by product
slug. Allow a site to declare multiple named catalogs (e.g. `treats` and
`merch`), each with its own catalog file and provider sync, and let each
`catalog` component or page reference one by name. One cart and one Stripe
checkout still span the whole site — the checkout Function resolves each
line item's slug through its named catalog, so `fulfillment_ref` stays
server-side and per-provider. Open design question: whether a single cart
may mix catalogs with different providers (one charge, split fulfillment)
or whether v1 of this feature requires one provider per site. Validation
extends to per-catalog slug resolution and cross-catalog slug collisions.

### 4. Business-category components (e.g. restaurant menus)

Add constrained components for common business verticals, starting with the
restaurant menu: sections, items, descriptions, prices, dietary marks —
structured data rather than prose tables, so themes can lay menus out well
on every screen. Same discipline as the goal-oriented components: the build
plan supplies content, the component owns layout, no raw HTML or styling
knobs. Candidates beyond menus: service/price lists, hours and locations,
staff profiles. Each vertical component should earn its slot with a real
site, the way `gallery` (anchovy) and `media-section` (danrevel.com) did.

### 5. Schema-driven validation for agent-native workflows

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

*(Item 6, "Retire the `site-spec.json` legacy bridge", shipped June 2026 — see Completed below. Numbering is preserved so existing references to later items stay stable.)*

### 7. Governed preview-and-revise workflow

Add a first-class workflow for previewing an existing site, collecting targeted
feedback, proposing a reviewable `build-plan.yaml` diff, and rebuilding only
after approval. Feedback may come from conversation, screenshots, or concrete
goals such as making the purpose clearer or the primary action more prominent.
This evolves the planned `/modify` command around current build-plan-first
usage, preserves stable page IDs, and keeps revision governed rather than
silently regenerating the site.

*(Items 8 "Generated not-found page" and 9 "Explicit redirects" shipped June
2026 — see Completed below. Numbering preserved.)*

### 10. Installable skill/plugin packaging

Clodsite currently ships as a template repo: clone it, `cd` into it, and open
an agent there. Package Clodsite as an installable skill or plugin available
from any directory, removing the clone-and-`cd` bootstrap. Multi-site
workspaces and configurable `SITES_DIR` have cleared the original storage and
invocation blockers.

### 11. General Pages Functions and secrets

Generalize the function and secret pipeline beyond the specific
`resend-form` use case. Turnstile-protected contact forms now exercise widget
provisioning and secret installation, but arbitrary generated Functions and
per-component secrets are not yet expressible. BBPP remains the driving
example: authenticated proxying and a separate rendering/email service.

### 11a. Shared author environment discovery

Today every checkout expects a repo-local `.env`, which makes multi-worktree and
multi-agent development clumsy even when all work is happening under one trusted
operator account. Add first-class shared environment discovery: preserve
already-exported shell variables, honor an explicit `CLODSITE_ENV=/path/to/env`,
fall back to the repo-local `.env`, then fall back to
`~/.config/clodsite/env`. Centralize this in one shell helper used by deploy,
setup verification, domain, teardown, status, and provisioning scripts, and
report the loaded env path without printing secret values.

*(Item 12, "Per-site environments and credential layers", shipped June 2026 as
declarative per-site secret binding — see Completed below. Numbering preserved.
The follow-on value-source generalization is item 11a; the trust-boundary half
is item 16.)*

### 13. MCP HTTP transport

The MCP server currently supports stdio only. Add an authenticated HTTP
transport so Clodsite can run as a shared or hosted deployment service while
preserving the same `list_components` and `deploy_site` contracts.

### 14. Root-page routing contract

Fix the current assumption that both the page with `id: home` and the first
page in `nav.order` map to `/`. Define one unambiguous root-page rule and reject
conflicting plans during validation. This remains low priority because all
current sites put `home` first.

### 15. Port mtw4 to Clodsite

Port mastertimewaster.com (the `mtw4` repo) to a Clodsite-managed site, the
way bbpp was ported. mtw4 is the second parchment client: its hand-rolled
Pages Function proxy becomes a `proxies` plan entry, its certificate page
becomes a `certificate-award` component (verified parity: it already collects
name/email/achievement and speaks the parchment render/issue protocol), and its
hardcoded Turnstile site key is replaced by Clodsite's managed widget
provisioning (retiring the manual `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`
handling). Its bespoke commerce — a *separate* Cloudflare Worker
(`mtw4/worker/`, zone routes `/checkout*` + `/webhook*`) with a localStorage
cart, Stripe, Printful (store 17783389), KV idempotency, and base+per-item
shipping — migrates wholesale to **commerce v1** Pages Functions, retiring the
Worker. With item 12 shipped, mtw4 simply declares `commerce.checkout.mode:
live` and `commerce.printful.api_key_env` (a third Printful store) — no friction.

Assessment (2026-06-27): ~70–80% of mtw4 is config + catalog sync today — it is
"bbpp with a cart and a blog." Two genuine Clodsite evolutions gate a faithful,
no-corners port:

- **Content collections (item 20)** — mtw4's `/posts/` "Journal" is a real blog
  (dated Markdown entries, generated index + entry pages). Clodsite has no
  collection/date concept; this is the largest piece and the one boundary
  expansion. Hard prerequisite. Spec:
  `docs/superpowers/specs/2026-06-27-content-collections-design.md`.
- **Brand-grade theming (item 18)** — mtw4's identity is bespoke CSS (DM Sans, a
  custom palette, italic hero emphasis, card/cart/cert styling). The fixed themes
  cannot reproduce it and the component model forbids the inline CSS it relies
  on, so a faithful port needs brand tokens; without them the port is functional
  but a brand regression.

Smaller fidelity items: constrained inline emphasis in `hero` headings ("Time,
*Reclaimed.*"), and confirming favicon discovery covers the 48×48 +
apple-touch set. Everything else — commerce, certificate, Turnstile, proxy,
domain, headers, secrets — is already covered by shipped work, including item 12.

### 16. Multi-tenant isolation model

Define, explicitly, the trust boundary Clodsite operates within — today it is
implicit, and that gap has already produced a live cross-tenant fulfillment +
buyer-PII leak (a bbpp order fulfilled by anchovy's webhook because Stripe
fans every event out to every endpoint on the shared account). The
`metadata.site` stamp that fixed it (checkout stamps the slug, each webhook
fulfills only its own) is a correctness guard *within a single trust
boundary* — it assumes all sites belong to one operator who is not adversarial
to themselves. It is **not a security boundary**: every site shares one
`STRIPE_SECRET_KEY` and one webhook signing secret, so any site could stamp
another's slug or forge another's events. That is fine for the current tier
and wrong the moment two sites are two different customers.

State two tiers and what each requires:

- **Single-operator, multi-site (today).** One trust boundary, many sites.
  In-account event fan-out is the operative hazard; the `metadata.site` stamp
  is sufficient. Shared Stripe/Resend/Cloudflare/`.env` are acceptable.
- **Customer-per-site (future).** Each site is its own trust boundary. The
  stamp is no longer load-bearing; isolation must be enforced by separating
  the underlying credentials across four layers, in increasing cost:
  1. **Stripe** — a separate secret key + webhook signing secret per site, so
     event fan-out cannot cross customers and the stamp becomes
     belt-and-suspenders rather than the only guard.
  2. **Resend / sender identity** — a per-customer verified domain, not the
     shared `mastertimewaster.com` sender.
  3. **Cloudflare** — per-customer account or at minimum scoped API tokens
     with KV/R2/D1 partitioning, replacing today's one account + one token.
  4. **Secrets transport** — per-site secret scoping so one customer's deploy
     cannot read another's keys, replacing the single flat shared `.env`.

This item is the isolation/trust-boundary half; the credential-plumbing half
lives in item 12 (Per-site environments and credentials). They are entangled
and should be designed together, but the boundary model is stated here so the
plumbing has a target to satisfy.

*(Item 17, "Component-schema papercuts", shipped June 2026 — see Completed below.
Numbering preserved.)*

### 18. Raise the theme ceiling (brand tokens / richer themes)

The most important qualitative finding from the Phase-0 benchmark: an
unconstrained agent (the control arm) produced a **visibly nicer-looking site**
than Clodsite's fixed `bold` theme — because it wrote bespoke per-brand CSS (a
display font pairing, a coffee-brand palette, accent bars, pill buttons,
shadows). Clodsite's visual quality is **capped by its three built-in themes**;
the control's ceiling is unbounded (at the cost of paying bespoke CSS every
project and risking cross-page inconsistency).

This matters because the product leads with the *maker outcome* — "a real site
you're proud of." Cheap edits and a small review surface don't help if the
visual ceiling sits below "looks bespoke."

The small-core-friendly fix is **not** to allow arbitrary per-site CSS (that
breaks the no-raw-escape-hatch principle), but to raise the ceiling within the
contract:

- **Theme tokens in the plan** — a bounded, governed way to set brand palette
  and font pairing (perhaps accent + density) without writing CSS.
- **Richer / more opinionated built-in themes** — more than three, and less
  generic.

Quantify the gap with **benchmark 2** (the polish benchmark): hold a
visual-quality bar constant and measure each arm's cost to clear it — and whether
Clodsite's themes can clear a *brand-specific* bar at all today. Design before
building; the theme model is the lever, the benchmark is the evidence.

Two concrete forcing functions: a faithful **mtw4 port (item 15)** needs brand
tokens to retain its bespoke look (DM Sans, custom palette, accent treatment),
and **content collections (item 20)** add long-form reading typography (index
lists, entry headers/dates, post-body rhythm) to the theme contract — surfaces
where generic styling shows most. Whatever theme model this item lands must cover
blog typography, not just landing-page chrome.

Design (proposed): `docs/superpowers/specs/2026-06-27-theme-ceiling-brand-tokens-design.md`
— three composing, curated/governed layers (personality `style` × curated
`palette` × bounded `brand` tokens), plus finer theme tokens and shared component
polish. Synthesizes the `docs/theme-system-notes.md` direction into a decided
plan; reconciles "curated, not configurable" with "brand tokens in the plan" via
automated quality gates (curated catalogs + a contrast gate) instead of a
raw-CSS escape hatch.

### 19. Printful sync preserves (or emits) product views

Surfaced by the product-level views work (Completed, below). The Printful sync
(`sync.mjs`) only writes `main` + `gallery`; the multi-view imagery on
hmc-next-gen's tees — now `images.views` + `images.by_option.Color` — is
**hand-authored on top of the sync**. Re-running the sync for that site today
overwrites the catalog and silently drops every back view and override. Pick a
durable fix: either (a) teach the sync to fetch and emit real placement mockups
(front/back/sleeve) as `images.views` when Printful exposes them, or (b) make
the sync preserve/merge existing hand-authored `images.views` /
`images.by_option` data instead of replacing the whole catalog. Until then, do
not re-sync hmc-next-gen without re-applying the multi-view data. Option (a)
also raises the visual ceiling for synced stores generally.

### 20. Content collections (blog / journal)

Clodsite models a site as a fixed list of 1–5 component pages; it has no concept
of a **collection** — an open-ended, dated set of long-form Markdown entries with
a generated index and per-entry pages. mtw4's "Journal" needs exactly this, and
nothing in the catalog, renderer, or plan schema can express it.

Add a `collections` plan block, each backed by a directory of Markdown entries
(frontmatter `title`/`date`/`description`), expanded by the build into an index
route (`/<id>/`, reverse-chronological) plus an entry route per file
(`/<id>/<slug>/`), rendered with a constrained post layout and the site theme.
Lean on Eleventy's native Markdown/collections/date handling; clodsite generates
the index template, the post layout, two date filters, nav wiring, and asset
passthrough. `validate-plan` validates the block structurally **and** each
entry's frontmatter (the content tree becomes a second authored input).

The notable evolution is that this **expands the inference boundary** from
`build-plan.yaml` alone to `build-plan.yaml` + a content tree (`posts/*.md`):
long-form prose belongs in Markdown, not YAML, but the entries remain
author-controlled deterministic input, so the `[LLM]`-authors / `[SCRIPT]`-builds
discipline holds. Prerequisite for item 15; raises the stakes for item 18 (it
adds long-form reading typography to the theme contract). Design (proposed):
`docs/superpowers/specs/2026-06-27-content-collections-design.md`.

### 21. Per-store Stripe keys

Per-site secret binding (item 12) made the Printful key and the Stripe mode
per-site, but the Stripe secret key and webhook secret still resolve to a single
shared account — so every live store currently transacts on one Stripe account.
Add an optional declarative `commerce.checkout.secret_key_env` (mirroring
`commerce.printful.api_key_env`) so each store runs checkout and its webhook on
its own Stripe account, with a deploy-time guard against silently moving a live
store between accounts. Surfaced by the June 2026 hmc-cycling.org incident.
Design (accepted):
`docs/superpowers/specs/2026-06-29-per-store-stripe-keys-design.md`.

**Capability implemented** (`secret_key_env` resolution, deploy preflight, and the
account-change guard in `provision-stripe-webhook.sh`). **Remaining (operator
migration):** create the bbpp Stripe account, roll restricted hmc/anchovy keys,
add the six `*_STRIPE_SECRET_KEY_{LIVE,TEST}` registry vars, set `secret_key_env`
in each commerce site's plan, retire the shared `STRIPE_SECRET_KEY_LIVE`, and
redeploy. Moves to Completed once the live stores are migrated.

### 22. Fulfillment observability and alerting

The webhook's KV state machine already records `processing`/`completed`/`failed`
with `last_error` and retries via Stripe, but nothing surfaces a stuck order: a
`failed` record (or a paid session that produced no record at all) sits silent.
Add failure alerting (via Resend), an order-state audit (`/orders` or `/status`
extension reading KV), and Stripe⇄KV reconciliation that flags paid-but-unfulfilled
sessions per account — the layer that would have caught the June incident the next
day. Optional Logpush→R2 for durable forensic logs. Design (accepted):
`docs/superpowers/specs/2026-06-29-fulfillment-observability-design.md`.

---

## Completed

### Declarative per-site secret binding
Shipped June 2026 (pending item 12). The repo `.env` is shared by every site in
`SITES_DIR`, so a site could not carry its own provider credentials or Stripe
mode without editing the file every other site's deploy reads — the root cause
of the Stripe test→live footgun and the multi-store Printful key pain. Instead
of an out-of-band per-site `.env` overlay, site-scoped secrets are now
**declarative in `build-plan.yaml`**: the plan names *which* env var supplies
each credential and *which* Stripe mode to bind, while the secret **values**
stay in the environment and never enter the plan. `commerce.checkout.mode:
test|live` selects `STRIPE_SECRET_KEY_{TEST,LIVE}` → `STRIPE_SECRET_KEY` (mode
is now declared and selects the key; `clodsite_stripe_mode` becomes a verifier);
`commerce.printful.api_key_env` and a site-scoped `resend-form` `api_key_env`
alias their canonical names. Resolution runs inside the
`clodsite_init_site_dir` chokepoint (`clodsite_resolve_bindings`), so every
secret-consuming entrypoint inherits it; a declared binding overrides an ambient
canonical value while the source it reads still honors #72 exported-wins.
Validation is split: `validate-plan` checks structure only (mode enum,
`api_key_env` syntax, resend-form agreement) and stays runnable with no
credentials; existence and Stripe key-shape are enforced at the point of use in
the secret-consuming scripts. `scripts/resolve-env.sh <site>` (sourceable)
resolves a site's bindings into the current shell and reports the source name +
mode — never the value. Clean cutover (no overlay file); the value-source
generalization is item 11a, the trust-boundary half item 16. Design:
`docs/superpowers/specs/2026-06-26-per-site-env-layers-design.md`.

### Explicit redirects
Shipped June 2026 (pending item 9). An optional top-level `redirects` block in
`build-plan.yaml` generates a Cloudflare Pages `dist/_redirects` file — the
redirect sibling of `headers` → `_headers`. Each rule is `{from, to, status?}`
with `from` a literal origin-relative path, `to` an origin-relative path or
`https://` URL, and `status` defaulting to 301 (302/303/307/308 allowed).
`validate-plan` enforces the shape, rejects duplicate sources, no-op redirects,
and sources that collide with a generated page route (which the static asset
would shadow); `render-redirects.sh` writes the file deterministically and
self-heals a stale one. Renamed/retired pages now redirect honestly while
genuinely unknown paths still hit the generated 404 (item 8). Design:
`docs/superpowers/specs/2026-06-26-explicit-redirects-design.md`.

### Product-level catalog views (decouple views from color)
Shipped June 2026 (pending item 19). The `catalog` component's multi-view
imagery was previously expressed only as `by_color[color] = {front, back?}`, so
a product needed a color option to show more than one image and the toggle was a
hardcoded front/back binary. Replaced with a **product-level `images.views`**
ordered list (`{label, image}`, first = default) plus an optional
`images.by_option[name][value].views` override layer keyed by any option;
`by_color` is removed. The active view set is derived from the current option
selection (product-level views, then selected-option overrides) — a seed packet
with no options gets a full labeled toggle; per-color photography rides on
`by_option`. View data lives in card-level `data-views` / `data-view-overrides`
JSON attributes; swatches stay pure selection inputs. Clean cutover (no compat
layer); hmc-next-gen — the only site carrying the data — was migrated in the same
change. Follow-on: item 19 above (sync preservation). Design:
`docs/superpowers/specs/2026-06-26-catalog-views-generalization-design.md`.

### Generated not-found page
Shipped June 2026 (pending item 8). Every site now builds a top-level
`dist/404.html`, which turns Cloudflare Pages' soft-`200` fallback into an
honest `404` for unknown URLs. The default page is synthesized for every site —
site chrome plus a "page not found" message and links back to every nav page —
and is `noindex` with no canonical/social metadata. Authors may override it with
a top-level `not_found` block in `build-plan.yaml` (`title?` + `components`)
drawn from the normal component vocabulary; the `catalog`,
`personalized-product`, and `certificate-award` types are disallowed on the 404
slot. Unblocks item 9 (explicit redirects). Design:
`docs/superpowers/specs/2026-06-25-not-found-page-design.md`.

### Component-schema papercuts
Shipped June 2026 (pending item 17). Catalog products may now **omit images**
(display-only listings render a no-media card; the cart and checkout already
tolerate a missing image) and carry an optional **`size`** label (a fixed spec
like "12 oz", shown as catalog metadata — distinct from selectable
options/variants). Added a **`faq`** component (native `<details>` disclosure, no
JS). The third reported papercut — "`quote` mandates an image" — was a misread:
the `quote` image was already optional. Backward-compatible (all existing
catalogs validate unchanged); regression tests added for image-less + size; suite
852.

### Retired the `site-spec.json` legacy bridge
Shipped June 2026 (pending item 6). `build-plan.yaml` is now the only active
site-authoring contract. `/interview` was rebuilt to write and validate a
complete `build-plan.yaml` directly (display name and slug included) instead of
producing an intermediate `site-spec.json`; it now calls `validate-plan.sh`.
Removed `/plan` and the six legacy scripts/modules (`write-spec`,
`validate-spec`, `finalize-plan` × `.sh`/`.mjs`), their tests, all six spec
fixtures, and the obsolete `site-spec.json` setup in the deploy-finalize tests.
Dropped the matching command permissions and corrected current operational docs
(README, CLAUDE.md, command help, demo shot list). Dated design and
implementation records were left intact as history. Existing sites that still
carry a `site-spec.json` keep building — no production command reads it. Design:
`docs/superpowers/specs/2026-06-12-site-spec-retirement-design.md`.

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
Shipped May 2026. Deletes the Cloudflare Pages project by name (read from
`build-plan.yaml`). If the site has a custom domain configured, also deletes the CNAME record
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
