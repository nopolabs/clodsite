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

## The `/modify` command

v1 covers the build path: interview → spec → plan → build → deploy. v2 adds a
governed *change* path — a delta interview that updates the existing spec and
selectively rebuilds only what changed. The spec carries a `spec_version`
field and stable page `id`s specifically to support this.

## Contact form + form backend

v1 contact is a `mailto:` link only. v2 adds a real submittable contact form.
Because Clodsite sites are static, a form needs a backend to receive the POST —
either a form service (Formspree, Web3Forms) or a Cloudflare Pages Function
that handles the submission and sends email via an API (Resend, MailChannels).
The spec's `contact.type` field is reserved for this.

## Ecommerce page and shopping cart

v1 produces generic content sites. v2 adds commerce: a product/catalog page
type and a shopping cart, following the Shopify-storefront + Cloudflare Pages
pattern used in the author's prior work (mtw4, bbpp). This is the largest v2
item and would likely be its own sub-project.

---

*v1 scope is defined in `docs/superpowers/specs/2026-05-13-clodsite-prd.md`.*
