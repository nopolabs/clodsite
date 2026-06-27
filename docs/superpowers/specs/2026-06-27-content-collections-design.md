# Content Collections (Blog / Journal) Design

**Date:** 2026-06-27
**Status:** Proposed
**Roadmap entry:** Content collections (pending item 20); prerequisite for item 15 (Port mtw4)

---

## Summary

Clodsite today models a site as a **fixed list of 1–5 pages**, each a typed
component array, with `nav.order` referencing page ids. There is no concept of a
**collection** — an open-ended, dated set of long-form entries with a generated
index and per-entry pages. The mtw4 port needs exactly this (its `/posts/`
"Journal"), and nothing in the catalog, the renderer, or the plan schema can
express it (confirmed: no blog/collection/date concept exists anywhere in the
codebase).

This design adds **content collections**: a site declares one or more
collections in `build-plan.yaml`, each backed by a **directory of Markdown
entries** authored alongside the plan. The build expands a collection into a
generated **index route** (reverse-chronological list) plus one **entry route**
per Markdown file, rendered with a constrained post layout and the site theme.

The deep change this introduces — stated plainly because it is the crux — is an
**expansion of the inference boundary**: today that boundary *is*
`build-plan.yaml`; collections add a second authored input, a content tree
(`<site>/posts/*.md`). Long-form prose does not belong inside YAML, and Markdown
files are the correct authoring surface. The boundary discipline is preserved:
the content tree is **author-controlled deterministic input** (the same trust
class as `build-plan.yaml`), the agent helps *write* entries (`[LLM]`), and the
build *renders* them deterministically (`[SCRIPT]`).

## Motivation

mtw4's Journal is a real blog: a `/posts/` index listing entries
reverse-chronologically (title + date + description) and per-post pages built
from `src/posts/*.md` with frontmatter dates, a post layout (title, `<time>`,
body, back-link), and post images. It relies on Eleventy collections, `tags`,
and `readableDate`/`isoDate` filters — none of which clodsite has. A faithful
port (item 15) cannot omit it.

This is also generally useful beyond mtw4: changelogs, release notes, portfolios,
and "updates" pages are the same shape. The construct is therefore designed as a
general **collection**, with the dated blog/journal as its v1 archetype.

## The model

A **collection** is:

1. A **declaration** in `build-plan.yaml` (`collections:` block) — id, title,
   source directory, and optional index-page chrome.
2. A **source directory** of Markdown **entries**, each with frontmatter
   (`title`, `date`, optional `description`/`cover`/`draft`).
3. A generated **index page** at `/<id>/` listing entries newest-first.
4. A generated **entry page** at `/<id>/<slug>/` per Markdown file.

The build joins (1) ⋈ (2) → (3) + (4), the same plan-meets-content pattern the
commerce catalog already uses (`build-plan.yaml` ⋈ `commerce/catalog.json`).

## Plan schema (`collections`)

A new optional top-level key, sibling of `pages`:

```yaml
collections:
  - id: journal              # route base /journal/; usable as a nav id
    title: Journal           # index <h1> and nav label
    source: posts            # dir under the site root holding <slug>.md entries
    sort: date-desc          # default; date-asc allowed
    intro:                   # optional chrome above the entry list on the index
      head:
        description: Notes, photos, and updates.
      components:
        - type: prose
          markdown: |
            ## Journal
            Occasional notes from the road.
```

- `id` — unique across pages, collection ids, and proxy mounts; matches
  `^[a-z][a-z0-9-]{0,31}$` (same shape as a page id / proxy mount).
- `source` — a path relative to the site root; literal, no `..`. Entries are the
  `*.md` files directly under it (non-recursive in v1).
- `intro` — optional; lets the index host a constrained component array
  (validated exactly like a page's `components`) above the generated list.
- All optional beyond `id`/`title`/`source`; omitting `collections` preserves
  today's behavior exactly.

## Entry frontmatter contract

Each `<source>/<slug>.md`:

```markdown
---
title: Japan Trip
date: 2026-04-08            # required; ISO 8601 (YYYY-MM-DD or full datetime)
description: Photos from a trip to Japan.   # optional; index blurb + <meta>
cover: /posts/images/japan-cover.jpeg       # optional; index thumb + entry hero
draft: false               # optional; true → excluded from build
---

## Tokyo

![Ueno Park](/posts/images/japan-0492.jpeg)

Body Markdown — rendered through the same `md` pipeline as the `prose` component.
```

- `title`, `date` required; `date` must parse (rejected at validation otherwise).
- `slug` derives from the filename (`japan-trip.md` → `japan-trip`), overridable
  with a `slug:` frontmatter key (validated to the page-id shape).
- Body is author-controlled Markdown. Inline HTML is permitted (the author is the
  trusted operator, as with `build-plan.yaml`) — documented as such, not treated
  as untrusted input.

## Routing & slugs

- Index: `/<id>/` (e.g. `/journal/`).
- Entry: `/<id>/<slug>/` (e.g. `/journal/japan-trip/`).
- `generatedPageRoutes(plan)` in `validate-plan` is extended to include every
  collection index and entry route, so the existing redirect-conflict and
  page-shadow checks cover them, and two collections (or a collection and a page)
  cannot collide on a route.
- The reserved `/404.html` and the root-page rule are unchanged.

## Rendering — lean on Eleventy, generate the scaffolding

Clodsite already runs Eleventy with the `src/` tree it generates from the plan.
Collections fit this without a new engine:

- `render-templates.sh` (the `[SCRIPT]` that emits `src/`) gains a collections
  pass that, per declared collection:
  1. Copies each non-draft entry `<source>/<slug>.md` into the Eleventy input as
     `src/<id>/<slug>.md` with an injected layout (`post`) and the collection tag
     (`<id>`), so Eleventy's **native** Markdown rendering, `collections.<id>`,
     and date handling do the heavy lifting.
  2. Generates the index template `src/<id>.njk` that renders `intro` (if any)
     then iterates `collections.<id>` reverse-chronologically into the list
     markup (title link, `<time>`, description).
  3. Generates the shared `post` layout (`src/_includes/post.njk`): theme chrome
     + header (title, formatted date) + body + "← All <title>" back-link +
     per-entry `<meta>` from `description`/`cover`.
  4. Copies the collection's `images/` (or declared asset dir) to `dist`.
- Two Nunjucks date filters are added in the Eleventy config the renderer emits:
  `readableDate` (e.g. "April 8, 2026") and `isoDate` (for `<time datetime>`),
  mirroring mtw4's filters. These are the only new template primitives.

The generated `src/` stays an implementation detail (already gitignored); the
authored inputs are `build-plan.yaml` + the content tree.

## Nav integration

`nav.order` entries may reference a **collection id** as well as a page id; a
collection id resolves to its index route `/<id>/`. Validation accepts a
nav id that matches either a page id or a collection id, and the nav label for a
collection is its `title`.

## Validation (`validate-plan`)

Structural, and — because the content tree is now an input — per-entry:

- **Collection block:** `id` shape + uniqueness across pages/collections/mounts;
  `source` is a safe relative dir that exists; `sort ∈ {date-desc, date-asc}`;
  `intro.components` validated by the existing `validateComponents`.
- **Entries:** the `source` dir is read; each `*.md` must have a non-empty
  `title`, a **parseable `date`**, an optional string `description`, a slug that
  is unique within the collection and matches the id shape, and (if present) a
  `cover` that is a site-root path or `https://`. A collection with **zero
  non-draft entries** is an error (an empty index is a mistake worth catching).
- Reading Markdown files is consistent with how `validate-plan` already reads
  `commerce/catalog.json`; no secrets, CI-safe.

## Theming (relationship to item 18)

Index list typography, entry header/date styling, and post-body prose rhythm are
**new surfaces the themes must cover**. v1 renders them with the existing themes
(no bespoke CSS — the no-raw-escape-hatch principle holds), but a faithful mtw4
port also wants its brand look, which is **item 18 (brand tokens / richer
themes)**. The blog raises the stakes for item 18: it adds long-form reading
typography to the theme contract, where generic styling shows most. The two are
sequenced together for the port.

## Trust & security model

Collection entries are authored by the **same trusted operator** who writes
`build-plan.yaml` — not end-user input. They are therefore rendered as trusted
content (inline HTML allowed, like `prose`), and this trust class is stated
explicitly in `docs/agent-authoring.md`. This differs from, e.g., `resend-form`
submissions or proxy bodies, which are untrusted and stay escaped/guarded. The
content tree is gitignored only where build artifacts are; **authored entries are
committed** to the sites repo (they are source, like the plan).

## Deferred (explicit non-goals for v1)

Named so the cut is visible, not silent:

- **Taxonomies / tag pages** — frontmatter `tags` may be stored, but generated
  tag-index pages are deferred.
- **Pagination** — the index lists all entries; paginate later if a collection
  grows large.
- **RSS/Atom feed** — a natural follow-on (`/<id>/feed.xml`); deferred.
- **Scheduled publishing** — `draft: true` excludes an entry; date-based
  future-publishing is deferred.
- **Nested/recursive sources** and per-entry component arrays (entry bodies are
  Markdown-only in v1).

## Testing

- **Validation:** accepts a valid collection + entries with no credentials;
  rejects a missing/empty source, an entry with no title or an unparseable date,
  duplicate slugs, a collection id colliding with a page id/mount, and a nav id
  that matches neither a page nor a collection.
- **Rendering:** a 2-entry fixture produces `/journal/` (entries newest-first,
  with `<time datetime>` and description) and `/journal/<slug>/` per entry
  (title, formatted date, rendered Markdown body incl. an image, back-link);
  `draft: true` entries are absent from both; the index `intro` components render
  above the list.
- **Routing:** a redirect or page whose route collides with a collection
  index/entry is rejected; a collection entry image lands in `dist`.
- **Dates:** `readableDate`/`isoDate` format a known date deterministically (UTC).

## Relationship to item 15 (Port mtw4)

This is a hard prerequisite for the mtw4 port. With it (and item 18 for brand
fidelity), mtw4 becomes: home (`hero` + `catalog`), about/contact (`prose` /
contact), certificate (`certificate-award` + parchment `proxies`), **journal (a
`collections` entry over `posts/`)**, commerce v1 (printful store 17783389,
`mode: live`, `api_key_env`), retiring `mtw4/worker/`. Everything else the port
needs already shipped, including item 12.
