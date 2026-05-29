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

---

## Pending

### Configurable `sites/` location

`sites/` version control ships in May 2026 with the repo initialized in-place.
The natural follow-on is making the path configurable — so `sites/` can live
outside the clodsite repo entirely (e.g., `~/my-sites/` or a dedicated GitHub
repo cloned elsewhere). This would be stored in `.env` as `SITES_DIR` and all
scripts that currently hardcode `sites/` or construct `SITE_DIR=sites/<name>`
would resolve paths against it. Depends on sites version control (shipped May 2026).

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

### Script-generated templates

`build-plan.json` is now the structured compile input (shipped May 2026). The
remaining step is replacing the LLM template-generation step in `/build` with a
script that reads `build-plan.json` and emits `.njk` files directly — making
`/build` fully scripted. This eliminates the last `Write` tool calls in `/build`
and removes the need for `acceptEdits` mode during builds.

### Unified build contract (merge spec config into build-plan)

Shipped May 2026. `build-plan.json` is now the single input to `/build`.
The `site_name` field was renamed to `slug`; a `name` field (display name,
injected by `finalize-plan.sh` from `spec.site.name`) was added. `write-site-json.sh`
and `apply-theme.sh` now read from `build-plan.json` only; `site-spec.json` is
interview scratch-state that `/build` never touches. `validate-plan.sh` also
gained a cross-reference check: all IDs in `nav.order` must exist in `pages`.

Known limitation: the nav href logic maps both the page with `id: "home"` AND the
first page in `nav.order` to `/`, so placing a non-home page first in nav causes a
routing conflict. All current sites have "home" first so this is inert — fix when
a site needs a different first-nav-page.

### The `/modify` command

v1 covers the build path: interview → spec → plan → build → deploy. v2 adds a
governed *change* path — a delta interview that updates the existing spec and
selectively rebuilds only what changed. The spec carries a `spec_version` field
and stable page `id`s specifically to support this.

### Contact form + form backend

Contact is a footer email link (`contact.enabled` / `contact.email` in the
spec). A submittable contact form would be a user-specified page in `pages[]`
— built using either a form service (Formspree, Web3Forms) or a Cloudflare
Pages Function with an email API (Resend, MailChannels). The interview would
ask for the preferred approach and `/build` would generate the page and form
markup accordingly.

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
