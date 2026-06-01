# Component Catalog (v1) — Design

**Date:** 2026-05-31
**Status:** Approved, ready for implementation plan
**Related roadmap entries:** "Page-type / component catalog", "Script-generated templates"

---

## Background

Today `/build` includes an `[LLM]` render step that converts `build-plan.yaml`
page content into Nunjucks templates. The LLM has freedom to emit arbitrary
HTML and `<style>` blocks, driven by a free-form `build_notes` field. Anchovy's
gallery grid CSS and ndig's code-block styling are the live examples.

This freedom is undesirable. It makes builds non-deterministic, makes the
generated templates hard to review, and lets sites diverge in ways that fight
the "describe → deploy" thesis. The roadmap entry "Script-generated templates"
calls for replacing the LLM render step with a script, but without a
constraining vocabulary that script can only handle predictable GFM→HTML
transforms — pages like anchovy and ndig would be orphaned.

The mental model that resolves this: **the LLM picks from a typed catalog of
composable components and fills in variables/config**. Expression range is
bounded by what the catalog supports. The catalog grows over time as new sites
need new shapes.

This spec defines v1 of that catalog and the build-pipeline changes that
consume it. It does NOT include multi-page generators (blog, ecommerce),
function-backed forms, or container components — see "Deferred" below.

---

## Design

### 1. Page schema: explicit component list

`build-plan.yaml` pages drop the implicit "page is a markdown body" model. A
page is `{ id, title, components: [...] }`, where each component carries its
type inline:

```yaml
pages:
  - id: gallery
    title: Gallery
    components:
      - type: prose
        markdown: |
          ## Gallery
          Cats Anchovy has approved.
      - type: gallery
        images:
          - { src: /assets/images/IMG_1122.jpeg, alt: Anchovy }
          - { src: /assets/images/IMG_1123.jpeg, alt: Anchovy }
          - { src: /assets/images/IMG_1124.jpeg, alt: Anchovy }
```

Components stack vertically only. There are no container components, no layout
hints, no nesting. Rich layout (hero with side-by-side image, etc.) lives
inside an individual component's bundled CSS — if a second site needs a hero
layout, a new `hero` component gets added to the catalog.

The top-level `content:` shorthand from previous versions is removed; a page
with just markdown is `components: [{ type: prose, markdown: "..." }]`. The
free-form `build_notes:` field is removed entirely.

`type` is required on every component. Single-key shorthand (`prose: { ... }`)
is rejected — keys would make it possible to author a component-shaped object
with no type and silently lose validation.

### 2. Catalog location: top-level `components/`

```
components/
  prose/
    component.njk       # Nunjucks fragment
    component.css       # scoped, prefixed .c-prose
    schema.json         # required + optional fields
  gallery/
    component.njk
    component.css       # .c-gallery
    schema.json
  mailto-form/
    component.njk
    component.css       # .c-mailto-form
    schema.json
  CATALOG.md            # auto-generated, source of truth for /plan's LLM
```

Top-level peer of `sites/`, `scripts/`, `docs/`, `scaffold/`. Components are a
first-class Clodsite concept, not an Eleventy implementation detail — keeping
them outside `scaffold/` reflects that. The eventual installable-skill
packaging (separate roadmap item) ships `components/` as a published artifact.

Each component is self-contained:
- `component.njk` — Nunjucks fragment, receives the component's config as
  locals. Includes are resolved via a new `components/` entry in
  `scaffold/.eleventy.js`'s include paths.
- `component.css` — scoped via `.c-<name>` class prefix on the component's
  root element. Cannot bleed into other components or themes.
- `schema.json` — declares required and optional fields. Used by
  `validate-plan.sh` and by the `CATALOG.md` generator. Format: a small
  custom JSON shape (`{ required: { field: "type" }, optional: { field:
  "type" }, description: "..." }`) — not full JSON Schema, since v1 only
  needs presence + primitive-type checks. Revisit if richer validation is
  needed.
- The component's root element in `component.njk` must carry the
  `c-<name>` class — this is the component's contract for keeping its
  CSS scoped. The CSS file selectors are all prefixed with `.c-<name>`.

### 3. CSS bundling: single `components.css`

`apply-theme.sh` is updated to concatenate every `components/*/component.css`
into one file written to `scaffold/src/css/components.css`. `base.njk` adds
one line that always loads it. No per-page optimization; with three components
in v1 the unused-bytes cost is negligible. Revisit if the catalog reaches
~15 components.

### 4. Build pipeline

`/build` becomes fully `[SCRIPT]`. The `[LLM]` render step is deleted. No
more `Write` tool calls during build; no more `acceptEdits` mode needed.

| Step | Status | Change |
|---|---|---|
| `validate-plan.sh` | Updated | Also validates each component's required fields against `components/<name>/schema.json`; rejects unknown `type` values |
| `write-site-json.sh` | Unchanged | Already wipes `src/`, emits `_data/site.json` |
| `apply-theme.sh` | Updated | Also concatenates `components/*/component.css` → `scaffold/src/css/components.css` |
| `render-templates.sh` | New | For each page, emits one `.njk` file to `sites/<name>/src/<id>.njk`. The emitted file iterates the page's components and `{% include %}`s each one, passing config via Nunjucks `with` (`{% include "prose/component.njk" with component %}`) so the component template accesses its config as `component.<field>` |
| `build-site.sh` | Unchanged | Eleventy runs as today |

`scaffold/src/_includes/base.njk` gets one new line:
`<link rel="stylesheet" href="/css/components.css">`.

`scaffold/.eleventy.js` adds the repo-root `components/` directory to the
Nunjucks include search path so per-site `.njk` files can `{% include
"prose/component.njk" %}`.

### 5. LLM-facing catalog: auto-generated `CATALOG.md`

`/plan`'s LLM needs to know what components exist and what fields each
requires. A new script `scripts/generate-catalog-md.sh` reads every
`components/*/schema.json` and emits `components/CATALOG.md` — one section
per component, listing required and optional fields with one-line
descriptions. Regenerated whenever schemas change (cheap; the script runs
unconditionally at the top of `/plan` and `/build`).

The `/plan` slash command's prompt references `components/CATALOG.md` as the
constraint vocabulary. The LLM cannot invent a component type — `validate-plan`
will reject it.

### 6. v1 catalog contents

Three components, abstracted from real usage in `sites/`:

| Component | Required | Optional | Source |
|---|---|---|---|
| `prose` | `markdown: string` | — | Every site's current `content:` field. Renders GFM (headings, paragraphs, lists, links, inline code, blockquotes, tables, fenced code blocks). Default styling lives in theme CSS; component CSS is empty for v1. |
| `gallery` | `images: [{ src, alt }]` | `caption: string` (per-image) | Anchovy's gallery page. Responsive grid: `repeat(auto-fit, minmax(300px, 1fr))`, fixed 400px row height, `object-fit: cover`. Scoped under `.c-gallery`. |
| `mailto-form` | `to: string`, `fields: [{ name, label, type, required? }]` | `subject: string`, `submit_label: string` | No existing example. Client-side form that composes a `mailto:` URL on submit — no backend. Closes the "contact form" gap without needing Pages Functions. |

The existing `contact: { enabled, email }` in `build-plan.yaml` (footer email
link) stays a site-level layout config, not a component. It's a footer concern,
not a page-body concern.

### 7. Migration of existing sites

All five current sites convert mechanically:

| Site | Pages | Conversion |
|---|---|---|
| `clodsite` | home, demo, design, roadmap | Each page's `content:` → single `prose` component |
| `nopolabs` | home | `content:` → `prose` |
| `medicarion` | home | `content:` → `prose` |
| `ndig` | home, usage | Each page's `content:` → `prose`. ndig/usage's hand-built `<style>` block becomes redundant once prose's tables + code-block styling lands in theme CSS. |
| `anchovy` | home, gallery | home: `content:` → `prose`. gallery: `prose` (heading only) + `gallery` component with the three images. |

`build_notes:` fields are deleted from all five plans.

A migration script `scripts/migrate-plan-to-components.sh` does the mechanical
conversion in one shot.

---

## What this is NOT (deferred)

| Deferred | Why |
|---|---|
| Container components (`row`, `columns`, hero with side-by-side image) | Only one site (bbpp) currently needs side-by-side layout. Wait for a second example. |
| Multi-page generators (`collections:`, blog `post-list` / `post-body`, ecommerce `product-list` / `cart`) | Dan's call. Requires a separate `collections:` design that the catalog doesn't yet support. |
| Function-backed forms (Turnstile + Pages Functions + secrets) | bbpp/award and mtw4/certificate use this pattern. Depends on page-types track slice 4 (Functions + secrets pipeline). Will become a `function-form` component family then. |
| Per-page CSS bundling optimization | Bundle splitting + conditional includes are overkill at three components. Revisit at ~15. |
| Component versioning | First time we break a schema for real, design versioning then. |
| Component-level JavaScript bundling | Only `mailto-form` needs JS in v1 (and only ~20 lines, inline). When a component needs richer JS, design bundling then. |

---

## Validation rules (enforced by `validate-plan.sh`)

- Every page MUST have `components: [...]` (non-empty array). No top-level `content:` on pages.
- Every component MUST have a `type` field whose value is the name of a directory under `components/`.
- For each component, all fields marked `required` in its `schema.json` MUST be present and of the correct type.
- Unknown fields on a component are an error (typo-protection — strict by default).
- `build_notes:` at any level is an error (catches old plans).

---

## Open risks

1. **CATALOG.md drift.** If a developer adds a `component.css` or `component.njk` and forgets to update `schema.json`, the LLM may not know about new fields. Mitigation: `validate-plan.sh` and the `CATALOG.md` generator both read schemas, so the validation gate catches it on first use. Could add a test that asserts every component dir has all three files.
2. **Eleventy includes path collision.** Adding `components/` to Nunjucks's search path means a per-site template could accidentally include a component by short name. Mitigation: always include components via their directory (`{% include "prose/component.njk" %}`), never bare names.
3. **Migration script risk.** Mechanical conversion of five live sites' plans. Run the script, then rebuild each site and visually diff against the deployed version before committing.
4. **CATALOG.md as LLM context cost.** With three components it's tiny. If the catalog grows large, `/plan`'s LLM context grows with it. Acceptable for v1; revisit when the catalog exceeds ~20 components.

---

## Success criteria

- `/build` contains zero `[LLM]` steps; `acceptEdits` mode no longer needed.
- All five existing sites build byte-identical (or trivially-different)
  `dist/` output after migration.
- A new site can be specified entirely from the components in `CATALOG.md`,
  with no `build_notes` and no LLM-rendered freedom.
- Adding a new component requires touching only `components/<new-name>/` and
  documenting it; no changes to scripts, layouts, or themes.
