# Clodsite Roadmap

Clodsite v1 is intentionally scoped: a static content site, 2–5 pages, three
visual styles, deployed to Cloudflare Pages. Everything below was deliberately
left out of v1 to keep the workflow shippable and honest. These are the
features v2 would add.

---

## Multi-site workspaces

Today the repo *is* the workspace — one clone builds one site in `site/`. v2
generalizes this to `sites/<name>/`, so a single Clodsite checkout can build
and manage multiple sites. The `site/` → `sites/<name>/` path is a deliberate
design choice in v1 so this migration is a small conceptual jump.

## Installable skill packaging

v1 ships as a template repo: clone it, `cd` in, open Claude Code. v2 packages
Clodsite as an installable skill/plugin available in any directory — removing
the clone-and-`cd` bootstrap step. The command files are already structured
(with `[SCRIPT]`/`[LLM]` annotations) to convert directly into a skill bundle.
This is coupled to multi-site workspaces: a shared, read-only skill bundle
needs a per-invocation place to put its output.

## Free-form interview opener

v1's `/interview` walks the user through a fixed 10-question script in a fixed
order. This works, but it's mechanical for users who already know what they
want. v2 starts with one open question — "Tell me about the site you want to
build" — and lets the LLM extract whatever it can from that response. Follow-up
questions are then targeted only at gaps and ambiguities, not a rote run-through.
A "let me confirm what I heard" summary before generating the spec keeps the
LLM inference honest, and the output is the same schema-validated JSON — the
contract with downstream scripts doesn't change. The fixed-question script
remains as the fallback for users who want to be walked through.

## The `/modify` command

v1 covers the build path: interview → spec → plan → build → deploy. v2 adds a
governed *change* path — a delta interview that updates the existing spec and
selectively rebuilds only what changed. The spec carries a `spec_version`
field and stable page `id`s specifically to support this.

## The `/teardown` command

v1 deploys sites but never removes them — taking a site down means deleting the
Cloudflare Pages project by hand in the dashboard (documented in `NEXT-STEPS.md`).
v2 adds an explicit `/teardown` command: it reads the project name from the spec,
shows the user exactly which live site and deployment history it will destroy,
requires confirmation, then deletes the project via the Cloudflare Pages API.
Project deletion is deliberately *not* folded into `/setup clean` — clearing the
local workspace and destroying a deployed site are different intents, and the
destructive remote action deserves its own confirmed command.

## Custom domain automation

v1 collects a custom domain in `/interview` and documents setup in `NEXT-STEPS.md`,
but the user manually adds the domain in the Cloudflare Pages dashboard. v2 automates
this using the Cloudflare Pages API (`POST /accounts/{id}/pages/projects/{project}/domains`).
When the domain is managed by Cloudflare DNS, the CNAME can be created via the Zones API
in the same step — fully hands-off. When DNS is external, the API creates the domain
association and prints the exact CNAME record for the user to add at their registrar.
Requires `Zone > DNS: Edit` permission added to the setup token prompt.

## Contact form + form backend

v1 contact is a `mailto:` link only. v2 adds a real submittable contact form.
Because Clodsite sites are static, a form needs a backend to receive the POST —
either a form service (Formspree, Web3Forms) or a Cloudflare Pages Function
that handles the submission and sends email via an API (Resend, MailChannels).
The spec's `contact.type` field is reserved for this.

## Blog page type

v1 pages are static, hand-authored content. v2 adds a blog page type — a
collection of dated posts with an index/listing page and individual post pages.
Eleventy collections handle the listing natively; the interview would ask for
post titles, dates, and content, and `/build` would generate one template per
post plus the index. Tags and an RSS feed are natural follow-ons.

## Calendar / events page type

v2 adds a calendar page type for events — a list or month view of upcoming
dated entries (title, date/time, location, description). Useful for the kind of
content site that currently has to hand-maintain an events list. Could render
purely static from the spec, or pull from an external calendar feed (iCal).

## Gallery page type

v2 adds a first-class gallery page type — a responsive image grid with optional
captions and lightbox. In v1 a gallery can be hand-built (images in
`site/images/`, grid CSS in a page `<style>` block), but it isn't a recognized
type: the interview doesn't ask for it and `/build` doesn't generate the grid.
A gallery type would let the interview collect images and captions, and `/build`
would emit the grid markup and scoped styles automatically.

## Ecommerce page and shopping cart

v1 produces generic content sites. v2 adds commerce: a product/catalog page
type and a shopping cart, following the Shopify-storefront + Cloudflare Pages
pattern used in the author's prior work (mtw4, bbpp). This is the largest v2
item and would likely be its own sub-project.

---

*v1 scope is defined in `docs/superpowers/specs/2026-05-13-clodsite-prd.md`.*
