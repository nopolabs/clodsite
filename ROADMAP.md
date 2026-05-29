# Clodsite Roadmap

Clodsite v1 is intentionally scoped: a static content site, 1–5 pages, three
visual styles, deployed to Cloudflare Pages. Items below were deliberately
deferred to keep the workflow shippable and honest.

---

## Completed

### Multi-site workspaces
Shipped May 2026. All commands require a `<site-name>` argument. Each site's
files live under `sites/<name>/` — specs, build plans, built output, and deploy
artifacts are all per-site and never shared.

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

---

## Pending

### The `/status` command

A read-only command that cross-references local `sites/` with live Cloudflare
Pages state. For each site it shows the Pages project name, production URL,
custom domain (if any), and last deployed timestamp — pulled from
`wrangler pages project list` and matched against `sites/*/site-spec.json`.
Also surfaces mismatches: a local site with no Pages project, or a deployed URL
that differs from what's in the spec. Useful once multiple sites are in flight.

### Installable skill packaging

v1 ships as a template repo: clone it, `cd` in, open Claude Code. v2 packages
Clodsite as an installable skill/plugin available in any directory — removing
the clone-and-`cd` bootstrap step. The command files are already structured
(with `[SCRIPT]`/`[LLM]` annotations) to convert directly into a skill bundle.
Now that multi-site workspaces are shipped, the dependency on per-invocation
output isolation is cleared.

### Free-form interview opener

v1's `/interview` walks the user through a fixed 10-question script in a fixed
order. v2 starts with one open question — "Tell me about the site you want to
build" — and lets the LLM extract whatever it can from that response. Follow-up
questions are then targeted only at gaps and ambiguities. A "let me confirm what
I heard" summary before generating the spec keeps the LLM inference honest. The
output is the same schema-validated JSON — the contract with downstream scripts
doesn't change. The fixed-question script remains as the fallback.

### Structured build plan (`build-plan.json`) and script-generated templates

v1's `/plan` produces `sites/<name>/build-plan.md` — a human-readable document
the LLM re-reads during `/build` to generate Nunjucks templates. v2 changes
`/plan` to produce `sites/<name>/build-plan.json` — a structured document with
per-page content fields — and replaces the LLM template-generation step in
`/build` with a script that reads the JSON and emits `.njk` files directly. The
LLM's job in `/plan` becomes content generation only; `/build` becomes fully
scripted. This also eliminates the `Write` tool calls and permission prompts that
currently require `acceptEdits` mode.

### The `/modify` command

v1 covers the build path: interview → spec → plan → build → deploy. v2 adds a
governed *change* path — a delta interview that updates the existing spec and
selectively rebuilds only what changed. The spec carries a `spec_version` field
and stable page `id`s specifically to support this.

### Contact form + form backend

v1 contact is a `mailto:` link only. v2 adds a real submittable contact form.
Because Clodsite sites are static, a form needs a backend to receive the POST —
either a form service (Formspree, Web3Forms) or a Cloudflare Pages Function
that handles the submission and sends email via an API (Resend, MailChannels).
The spec's `contact.type` field is reserved for this.

### Blog page type

v1 pages are static, hand-authored content. v2 adds a blog page type — a
collection of dated posts with an index/listing page and individual post pages.
Eleventy collections handle the listing natively; the interview would ask for
post titles, dates, and content, and `/build` would generate one template per
post plus the index. Tags and an RSS feed are natural follow-ons.

### Calendar / events page type

v2 adds a calendar page type for events — a list or month view of upcoming
dated entries (title, date/time, location, description). Useful for the kind of
content site that currently has to hand-maintain an events list. Could render
purely static from the spec, or pull from an external calendar feed (iCal).

### Gallery page type

v2 adds a first-class gallery page type — a responsive image grid with optional
captions and lightbox. In v1 a gallery can be hand-built (images in
`sites/<name>/images/`, grid CSS in a page `<style>` block), but it isn't a
recognized type: the interview doesn't ask for it and `/build` doesn't generate
the grid. A gallery type would let the interview collect images and captions, and
`/build` would emit the grid markup and scoped styles automatically.

### Ecommerce page and shopping cart

v1 produces generic content sites. v2 adds commerce: a product/catalog page
type and a shopping cart, following the Shopify-storefront + Cloudflare Pages
pattern. This is the largest v2 item and would likely be its own sub-project.

---

*v1 scope is defined in `docs/superpowers/specs/2026-05-13-clodsite-prd.md`.*
