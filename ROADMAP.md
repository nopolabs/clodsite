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

### Deploy pipeline reads slug from build-plan.yaml
Shipped May 2026. `deploy.sh` and `deploy-finalize.sh` now read the project slug
directly from `build-plan.yaml` instead of `site-spec.json`. The `site-spec.json`
existence check in `deploy.sh` was replaced with a `build-plan.yaml` check.
The `deployed_url` write-back in `deploy-finalize.sh` was removed entirely — the
live URL is shown in the terminal and written to `NEXT-STEPS.md`. Sites built
from a hand-authored `build-plan.yaml` no longer need a `site-spec.json` at any
stage of the pipeline.

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

## Pending

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

### GFM build plan format (build-plan.yaml)
Shipped May 2026. `build-plan.json` replaced by `build-plan.yaml`. Page content
uses YAML literal block scalars (`|`) containing GitHub Flavored Markdown — human-readable
in any editor, with a well-defined HTML mapping. `js-yaml` added as a root-level
dependency; all four build pipeline scripts (`validate-plan`, `finalize-plan`,
`write-site-json`, `apply-theme`) parse YAML via `require('js-yaml').load()`.

### The `/modify` command

v1 covers the build path: interview → spec → plan → build → deploy. v2 adds a
governed *change* path — a delta interview that updates the existing spec and
selectively rebuilds only what changed. The spec carries a `spec_version` field
and stable page `id`s specifically to support this.

### Page-types extension track (remaining slices)
Slice 1 (per-site assets + favicons) shipped May 2026. Remaining slices,
ordered:

- **Slice 2:** `<head>` extras + per-path response `_headers`. Schema
  grows a `head:` block and a `headers:` block. Multi-component header
  additivity is the open design question.
- **Slice 3:** Forms — `mailto:` / form-service tier, no backend.
  Closes the `### Contact form + form backend` roadmap item and gets
  bbpp's form *shape* expressible (backend deferred to slice 4).
- **Slice 4:** Cloudflare Pages Functions + secrets pipeline. The big
  unlock — Turnstile, proxying, dynamic capabilities. Deliberately
  deferred until slices 1–3 ship so the schema can be designed against
  two real form examples (mailto + bbpp) rather than one.

Each slice gets its own spec → plan → ship cycle. bbpp is the driving
example for the track; the spec for slice 1
(`docs/superpowers/specs/2026-05-31-static-assets-favicons-design.md`)
documents the full bbpp gap analysis.

### Contact form + form backend

Contact is a footer email link (`contact.enabled` / `contact.email` in the
spec). A submittable contact form would be a user-specified page in `pages[]`
— built using either a form service (Formspree, Web3Forms) or a Cloudflare
Pages Function with an email API (Resend, MailChannels). The interview would
ask for the preferred approach and `/build` would generate the page and form
markup accordingly.

---

*v1 scope is defined in `docs/superpowers/specs/2026-05-13-clodsite-prd.md`.*
