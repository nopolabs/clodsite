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

- None currently.

## Pending

Items are ordered by proposed implementation priority.

*(Item 1, "Commerce v1 — sell a small catalog of products", shipped June 2026 — see Completed below. Numbering preserved so existing references to later items stay stable.)*

### 2. Customer order confirmation emails

Send a transactional confirmation to the customer after a paid order is
durably recorded. Decided: **supplement** Stripe's receipt (don't replace it),
in three phases — (1) tune the per-store Stripe receipt, (2) order-confirmation
email on fulfillment success, (3) shipping notifications from Printful events.
Design (accepted): `docs/superpowers/specs/2026-06-30-customer-order-emails-design.md`.

**Phases 1–2 shipped.** Phase 2 (Claude implements, Codex reviews): opt-in
`commerce.contact: { from, reply_to? }` build-plan block; on the webhook's
`completed` transition the customer gets a store-branded confirmation (order
id, items + variants and totals via a Stripe `line_items` retrieve, ship-to
address, a fulfillment expectation) — idempotent (`confirmation_sent_at` on the
KV record), non-blocking (bounded, failure-swallowing, diagnostics on
`confirmation_error`), and never affects the order outcome.

**Phase 3 shipped** (Claude implements, Codex reviews — plan first, then
code; plan `docs/superpowers/plans/2026-06-30-printful-shipping-notifications.md`):
shipping notifications from Printful `package_shipped` events. Auth model is
verify-on-receipt — the webhook payload is never trusted for shipment
content; only its order id/shipment id are used to re-fetch the order from
Printful's own API before sending anything. Gated on `commerce.contact.from`
already being set (no new build-plan field, reuses the phase-2 sender);
per-`(order_id, shipment_id)` idempotency reuses the existing `ORDERS` KV
binding; a permanent condition (no recipient email) records a skip and
returns 200 (never retried), while genuine transient failures return 500 so
Printful's own retry can help. `provision-printful-webhook.sh` registers the
webhook (confirmed live: `POST /webhooks` scoped via the `X-PF-Store-Id`
header, not the Orders API's `?store_id=` query param) and treats
`PRINTFUL_WEBHOOK_SECRET` as a stable `.env` credential, never minted and
consumed in the same deploy. **Spike item resolved (2026-07-02):** the
`GET /orders/{id}` response shape was confirmed against two real HMC Printful
orders (164927910, 164927484) on store 17828143. All template field reads
match: `shipment.carrier`/`service`/`tracking_number`/`tracking_url`/`ship_date`,
`shipment.items[].item_id` joined to `order.items[].id`/`.name`, and
`order.recipient.*`. Two findings from that check: (1) `carrier` is an
uppercase machine code (`DHLGLOBALMAIL`) while `service` is human-readable
(`DHL Globalmail Parcel Expedited`) — the email now prefers `service`; (2)
Printful UI-placed / operator-created replacement orders carry **no
`recipient.email`** (shipping address only), so they hit the permanent-skip
path and send nothing — real Clodsite-checkout orders always carry the email
from Stripe, so store sales are unaffected, but the missing-email skip is a
real, reachable case for manually-created orders. A per-site fallback
recipient for the no-email case is a candidate follow-on (see below).

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

### 3a. Per-site Printful webhook secrets

Printful shipping notifications currently use one shared
`PRINTFUL_WEBHOOK_SECRET`, embedded in each site's registered
`/api/printful-webhook?token=...` URL and pushed as that site's Pages secret.
The Function itself is already rendered per site, so the missing hardening is
credential selection: allow `commerce.printful.webhook_secret_env` to name a
site/store-specific source such as `ANCHOVY_PRINTFUL_WEBHOOK_SECRET`, falling
back to `PRINTFUL_WEBHOOK_SECRET` during migration. Missing-secret guidance
should print the actual required env var name with the existing
`pfws_<32 lowercase hex chars>` convention. This keeps rotation and compromise
scope aligned with `commerce.printful.api_key_env`.

### 3b. Operator fallback for shipments with no customer email

Today a `package_shipped` event for an order with no `recipient.email` takes
the permanent-skip path (records the skip, returns 200, sends nothing). That is
correct for a customer email — there is no address to send to — but it is a
silent skip only visible in a KV record no one reads. This class of order is
real and reachable: Printful **UI-placed / operator-created replacement
orders** carry a shipping address but no email (confirmed on real HMC orders,
2026-07-02), whereas Clodsite-checkout orders always carry the email from
Stripe. So the missing-email case is almost exclusively operator-created
orders — where the operator placed the order and may want to forward tracking
to the customer manually.

Proposal: an **opt-in per-site fallback recipient** so the no-email case routes
the (fully-detailed, forwardable) shipping notification to an operator inbox
instead of dropping it — e.g. `commerce.contact.no_recipient_fallback:
ops@site.example` (default unset → keep today's skip). The message should
**self-identify as a fallback** ("no customer email on file — forward
manually") so it is never mistaken for a delivered customer email, and stay
idempotent (record the fallback send so redelivery does not re-send). Design
note: this overlaps item 22's operator-alert channel
(`CLODSITE_COMMERCE_ALERT_TO/FROM`); decide deliberately whether to reuse that
channel (consistent, but PII-minimized — omits the shipping detail the
operator needs to forward) or a dedicated fallback recipient (carries the full
forwardable content, at the cost of a new field). Lean: dedicated fallback,
because the operator's actual job here is to forward the complete notification.
Do not build two parallel operator-notification paths without settling this.

### 3c. HTML customer order emails with item thumbnails

Customer order-confirmation emails are currently plain text. They are correct,
but they do not look like a polished storefront receipt: line items render as
text only, with no product thumbnail or richer layout. Add an HTML body while
preserving the existing text fallback. The HTML version should show each item
with quantity, name, price, and a thumbnail when available; when no image exists,
fall back cleanly to text-only item rows.

Preferred data path: include absolute catalog image URLs in Stripe Checkout
`product_data[images][]`, then retrieve enough line-item/product data in the
webhook to render the email without trusting browser-submitted cart data. This
requires resolving root-relative catalog assets against the site's production
domain at checkout time. Keep the scope to customer confirmation emails first;
shipping notifications can stay text-only until there is evidence they need the
same treatment.

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

Design (proposed):
`docs/superpowers/specs/2026-07-03-governed-revise-workflow-design.md` — a
five-phase **Revise** workflow (capture → propose → report → approve → apply).
The crux: the sites repo commits both authored inputs and built `dist/` and is
clean between deploys, so the plan diff *is* the proposal and a rebuild +
`git diff` on `dist/` *is* the blast radius — governance becomes mechanically
checkable (one new script, `revise-report.sh`), and the empty-report-on-
unchanged-plan case doubles as the determinism verifier. Apply reuses the
existing Deploy pipeline; removed routes must be covered by `redirects`
(item 9). Slice 2 (shareable remote preview via Pages preview deployments) is
named but deliberately deferred to its own design pass.

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

*(Items 21 "Per-store Stripe keys" and 22 "Fulfillment observability and
alerting" shipped June 2026 — see Completed below. Numbering preserved.)*

### 23. Discoverability pack (sitemap, robots, local-business data)

Clodsite emits per-page descriptions, canonical URLs, Open Graph/Twitter tags,
and generic `WebSite`/`WebPage` JSON-LD — but nothing that helps a small
business actually be *found*: no `sitemap.xml`, no `robots.txt`, no structured
local-business data, and no component for hours/location. For a local business,
discoverability is most of the point of having a site; a competent developer
would set all of this up on day one. Four pieces, all deterministic compiler
output from declarative intent (no new inference, no new runtime):

1. **`dist/sitemap.xml`** generated from the page routes (and collection routes
   once item 20 lands). Requires absolute URLs, so it is gated on
   `custom_domain` — same derivation the canonical-URL logic already uses. The
   generated 404 stays out; `noindex` conventions are honored.
2. **`dist/robots.txt`** referencing the sitemap. Explicit and boring by
   default (allow all + sitemap line); an optional plan block can add
   disallow rules, validated like `redirects`.
3. **An optional top-level `business` block** — legal/display name, street
   address, phone, opening hours, geo, and a bounded category enum
   (`LocalBusiness` subtype: restaurant, store, professional service, …) —
   compiled into `LocalBusiness` JSON-LD on the home page. The block is site
   intent, owned by the plan; validation checks shape only.
4. **An `hours-location` component** rendering that same site-level `business`
   block (no duplicated data in the component), so the human-visible hours and
   the machine-readable hours can never disagree. This is the first item-4
   vertical component, and the one every local business needs.

Operator guidance (docs, and possibly a `NEXT-STEPS.md` line): keep the
`business` block consistent with the owner's Google Business Profile — the two
listings reinforce each other.

### 24. Analytics and owner reporting

Clodsite has no evidence loop: after deploy, neither the operator nor the site
owner learns anything about how the site is doing. A competent developer
reports back — "300 visits this month, 4 form submissions, the menu page is
your most-viewed." Two pieces:

1. **Opt-in Cloudflare Web Analytics.** A plan-level opt-in (e.g.
   `analytics: cloudflare`) provisions the Web Analytics site via the API at
   deploy time (same pattern as Turnstile widget provisioning — no tokens in
   the plan) and injects the beacon snippet into the base layout. Cookie-free
   and privacy-friendly, so no consent-banner burden; free tier. Local builds
   make no Cloudflare API calls; the snippet is inert without its token.
2. **A read-only `/report [site]` command** in the spirit of `orders.sh` /
   `reconcile-orders.sh`: pull the traffic summary from the Cloudflare API and
   combine it with the signals Clodsite already has (order states from the
   `ORDERS` KV, form/webhook health) into an owner-readable summary — the
   "monthly maintenance visit" in one command. `[SCRIPT]`, read-only, per
   site.

Possible follow-on (not in scope initially): scheduled delivery of the report
to the site owner via Resend. Builds on item 22's observability tooling;
pairs naturally with item 7 (the report surfaces what to change, the revise
workflow changes it).

---

## Completed

### Client readiness — first external-client guardrails
Shipped July 2026 (pending item 25). Closed the three smallest gaps before
working with a real client under the single-trusted-operator model. Added
`docs/client-onboarding.md`, which maps account ownership: the client owns
Stripe and domain registration; the operator keeps shared Cloudflare and Resend
(client sender domains verified in the operator Resend account; decision
2026-07-03), with a clear "what the client takes if we part ways" section.
Added a names-only secret audit command, `scripts/resolve-env.sh --list <site>`,
which reports each declared binding as canonical ← source with set/MISSING
status and Stripe mode, never values; the shared registry convention is one
commented section per site so offboarding is delete-section-and-audit. Promoted
the Resend binding from `resend-form.api_key_env` to site-level
`email.api_key_env`, so commerce-only email sites can declare the same
`RESEND_API_KEY` binding as contact-form sites; the component field is removed
pre-1.0 and validation points authors to the new location.

### Commerce v1 — sell a small catalog of products
Shipped June 2026 (pending item 1). Ecommerce as a Clodsite capability: a
`catalog` component (display-only lookbook through live checkout, with size
guides), site-level cart chrome with preview/live activation, Stripe Checkout via
generated Pages Functions, and a two-provider fulfillment abstraction (`printful`
+ `manual`). Catalog data is provider-synced, normalized, and committed with
mirrored assets, so builds stay offline. Webhook fulfillment runs a KV-backed
order state machine (`processing`/`completed`/`failed`) with Stripe-retry recovery
and stored diagnostics. Delivered across an 11-phase validation ladder and
**dogfooded by hmc-cycling.org, anchovy-mug, and bbpp** (bbpp adding personalized
mug commerce backed by generated certificate artwork). Remaining commerce work is tracked separately:
order-confirmation emails (item 2), named catalogs (item 3), the mtw4 port (item
15), and Printful sync preserving product views (item 19). v1 deliberately defers
dynamic shipping rates, per-variant pricing, >2-dimension variant UI, and digital
goods. Design: `docs/superpowers/specs/2026-06-10-commerce-design.md`.

### Fulfillment observability and alerting
Shipped June 2026 (pending item 22). The webhook KV state machine already
recorded `processing`/`completed`/`failed` with `last_error` and retried via
Stripe, but a stuck order sat silent. Added in three slices: **(1) failure
alerting** — the webhook emails the operator via Resend on `state: failed`,
throttled with `alerted_at`/`alert_count` (5s-bounded, non-blocking, opt-in via
`CLODSITE_COMMERCE_ALERT_{TO,FROM}`); **(2) order audit** — read-only
`scripts/orders.sh [site]` (`/orders`) lists each site's `ORDERS` KV by state,
highlighting `failed` and stale `processing`; **(3) Stripe⇄KV reconciliation** —
read-only `scripts/reconcile-orders.sh [site]` lists recent paid Checkout Sessions
per resolved Stripe account (7-day lookback, full pagination), filters by
`metadata.site`, and flags paid sessions with a missing namespace, missing record,
or non-`completed` record — the catch-all that surfaces a silent loss regardless
of cause. Surfaced by the June 2026 hmc-cycling.org incident; this is its safety
net. Optional follow-up (not built): Logpush→R2 forensic archival. Design:
`docs/superpowers/specs/2026-06-29-fulfillment-observability-design.md`; plan:
`docs/superpowers/plans/2026-06-29-fulfillment-observability.md`.

### Per-store Stripe keys
Shipped June 2026 (pending item 21). Per-site secret binding (item 12) made the
Printful key and Stripe mode per-site, but the Stripe secret key and webhook
still resolved to a single shared account — every live store transacted on the
Anchovy account (the root of hmc-cycling.org's orders being unreachable and of
ported hmc-next-gen routing HMC payments to the wrong account). Added optional
`commerce.checkout.secret_key_env`, resolved as `<base>_<MODE>` (mirroring
`commerce.printful.api_key_env`), with the shared `STRIPE_SECRET_KEY_{LIVE,TEST}`
as fallback. A deploy-time account-change guard fetches `GET /v1/account` and
refuses to silently move a store between accounts within a mode (records
`account_id` in `.stripe-webhook-state.json`; override
`CLODSITE_ALLOW_STRIPE_ACCOUNT_CHANGE=1`). Restricted keys need **Connect →
Accounts: Read** (`accounts_kyc_basic_read`) for the guard. All four commerce
sites migrated onto their own accounts (anchovy + anchovy-mug → Anchovy, bbpp,
hmc-next-gen → HMC) and verified with live purchases (incl. an end-to-end HMC
order + refund). The shared `STRIPE_SECRET_KEY_LIVE` was then retired from the
registry (`_TEST` kept for `clodsite-demo`, which is test/preview) and the
orphaned bbpp/hmc webhook endpoints removed from the Anchovy account. Surfaced by
the June 2026 hmc-cycling.org incident. Design:
`docs/superpowers/specs/2026-06-29-per-store-stripe-keys-design.md`.

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
`commerce.printful.api_key_env` and site-scoped `email.api_key_env` alias their
canonical names. Resolution runs inside the
`clodsite_init_site_dir` chokepoint (`clodsite_resolve_bindings`), so every
secret-consuming entrypoint inherits it; a declared binding overrides an ambient
canonical value while the source it reads still honors #72 exported-wins.
Validation is split: `validate-plan` checks structure only (mode enum and
binding env-var-name syntax) and stays runnable with no credentials; existence
and Stripe key-shape are enforced at the point of use in the secret-consuming
scripts. `scripts/resolve-env.sh <site>` (sourceable) resolves a site's bindings
into the current shell and reports the source name + mode — never the value.
Clean cutover (no overlay file); the value-source generalization is item 11a,
the trust-boundary half item 16. Design:
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
