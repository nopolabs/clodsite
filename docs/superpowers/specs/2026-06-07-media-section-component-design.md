# `media-section` Component — Design

**Date:** 2026-06-07
**Status:** Approved, ready for implementation plan
**Related roadmap entries:** "Page-type / component catalog", "Page-types extension track"

---

## Background

Clodsite's `prose` component can render Markdown images, and its `gallery`
component can render a collection of images. Neither component expresses the
common editorial relationship between one image and one block of prose.

The first concrete use case is the home page of `danrevel.com`: introductory
copy paired with a portrait. A Markdown image proved that local assets already
flow through the build pipeline, but global styling for images inside `prose`
cannot express whether an image belongs to the left, right, above, or below its
associated text. It also applies the same presentation to unrelated image
types such as portraits, diagrams, and landscape photographs.

The component catalog design deliberately deferred side-by-side components
until more than one real site needed them. `danrevel.com` and the existing BBPP
layout now provide two concrete examples.

This design adds a constrained `media-section` component. It does not add a
general grid, arbitrary row and column coordinates, text flow around images,
or nested components.

---

## Mental Model

A `media-section` is one editorial section containing:

- one Markdown prose block;
- one image;
- an explicit relationship between the image and prose.

On wide screens, the image may appear beside, above, or below the prose. On
narrow screens, every layout becomes a single column with a deterministic
reading order.

Authors describe editorial intent. Component CSS owns dimensions, gaps,
responsive breakpoints, and presentation details.

---

## Design

### 1. Component files

`components/media-section/` contains the standard three catalog files:

| File | Purpose |
|------|---------|
| `schema.json` | Fields and validation rules for `validate-plan.sh` and catalog generation |
| `component.njk` | Semantic figure and prose markup |
| `component.css` | Scoped wide-screen layouts and narrow-screen stacking |

The component requires no JavaScript and no new build step.

### 2. Build-plan contract

```yaml
- type: media-section
  layout: image-right
  image:
    src: /assets/retired-cap.jpg
    alt: Dan Revel wearing a Retired cap
    caption: Retired, but still building.
  markdown: |
    # Dan Revel

    **Retired software engineer. Lifelong builder and learner.**

    After more than 40 years in software engineering, I have traded the
    full-time career for something more open-ended.
```

#### Required fields

| Field | Type | Rules |
|-------|------|-------|
| `layout` | string enum | One of `image-left`, `image-right`, `image-above`, or `image-below` |
| `image` | object | Contains exactly the image fields defined below |
| `markdown` | string | GitHub Flavored Markdown rendered through the existing `md` filter |

#### Image fields

| Field | Type | Rules |
|-------|------|-------|
| `src` | string | Required and non-empty |
| `alt` | string | Required and non-empty |
| `caption` | string | Optional plain text |

`media-section` supports exactly one image. Authors stack multiple
`media-section` components when a page needs multiple image-and-prose
relationships.

### 3. Supported layouts

#### Wide screens

| Layout | Rendering |
|--------|-----------|
| `image-left` | Two columns: image left, prose right |
| `image-right` | Two columns: prose left, image right |
| `image-above` | One column: image above prose |
| `image-below` | One column: prose above image |

For left and right layouts, the component controls the column proportions and
gap. The build plan does not expose widths, percentages, row counts, column
counts, spans, coordinates, or breakpoints.

#### Narrow screens

| Configured layout | Narrow-screen order |
|-------------------|---------------------|
| `image-left` | Image above prose |
| `image-right` | Prose above image |
| `image-above` | Image above prose |
| `image-below` | Prose above image |

This mapping preserves the reading order expressed by the configured layout.
The DOM order must match the narrow-screen reading order so keyboard,
screen-reader, and no-CSS experiences remain coherent. Wide-screen positioning
may use CSS Grid placement without changing DOM order.

### 4. Markup and accessibility

The root element carries the catalog-required `c-media-section` class and a
layout modifier class:

```html
<section class="c-media-section c-media-section--image-right">
  <div class="c-media-section__prose">
    <!-- rendered Markdown -->
  </div>
  <figure class="c-media-section__media">
    <img src="/assets/retired-cap.jpg"
         alt="Dan Revel wearing a Retired cap">
    <figcaption>Retired, but still building.</figcaption>
  </figure>
</section>
```

The template may reverse the prose and figure in the DOM as needed to preserve
the narrow-screen order defined above.

Accessibility requirements:

- Every image has a non-empty `alt` value.
- The image renders with its supplied `alt` text without transformation.
- A supplied caption renders as plain text inside `<figcaption>`.
- A missing caption omits `<figcaption>` entirely.
- The component preserves the image's natural aspect ratio.
- The component does not crop images.

### 5. Presentation behavior

`component.css` is fully scoped beneath `.c-media-section`.

Required behavior:

- Images are responsive and never overflow their component.
- Images use `display: block`, `max-width: 100%`, and `height: auto`.
- Left and right layouts use CSS Grid on wide screens.
- Above and below layouts remain single-column at all widths.
- Left and right layouts collapse to one column at the component's breakpoint.
- Spacing, column proportions, maximum image dimensions, caption typography,
  and breakpoint values are component-owned defaults.
- The component must work with all three existing site themes without
  requiring theme-specific markup.

The first implementation should prefer simple neutral styling. Rounded
corners, borders, shadows, aspect-ratio cropping, and decorative backgrounds
are not part of the contract.

### 6. Nested schema validation

The current catalog schema format maps a field name directly to a primitive
type string:

```json
{
  "required": {
    "markdown": "string"
  }
}
```

This remains valid. To support `media-section`, a field declaration may also
be a descriptor object. The new form is backward-compatible with every
existing schema.

`media-section/schema.json` uses:

```json
{
  "description": "One image paired with a Markdown prose block in a constrained responsive layout.",
  "required": {
    "layout": {
      "type": "string",
      "enum": [
        "image-left",
        "image-right",
        "image-above",
        "image-below"
      ]
    },
    "image": {
      "type": "object",
      "required": {
        "src": {
          "type": "string",
          "non_empty": true
        },
        "alt": {
          "type": "string",
          "non_empty": true
        }
      },
      "optional": {
        "caption": "string"
      }
    },
    "markdown": "string"
  },
  "optional": {}
}
```

`validate-plan.sh` must recursively validate descriptor objects.

Descriptor rules:

- A primitive type string retains its current meaning.
- A descriptor must contain `type`.
- `enum` is valid only for `type: "string"` and restricts the accepted values.
- `non_empty: true` is valid only for `type: "string"` and rejects empty or
  whitespace-only values.
- `required` and `optional` are valid only for `type: "object"`.
- Object fields not listed in `required` or `optional` are rejected.
- Missing nested required fields are rejected.
- Nested values are checked recursively, allowing the mechanism to support
  future nested component fields without another validator redesign.

Validation error messages must include the full field path, for example:

```text
pages[0].components[0].image.alt is required
pages[0].components[0].image.alt must be a non-empty string
pages[0].components[0].layout must be one of: image-left, image-right, image-above, image-below
pages[0].components[0].image has unknown field "width"
```

### 7. Catalog generation

`generate-catalog-md.sh` must render descriptor objects into useful
LLM-facing documentation rather than displaying `[object Object]`.

For `media-section`, `CATALOG.md` must communicate:

- the four accepted layout values;
- that `image.src` and `image.alt` are required non-empty strings;
- that `image.caption` is optional;
- that exactly one image is supported;
- the complete YAML example.

Existing primitive-only schemas must continue to generate the same catalog
output they generate today.

### 8. Markdown images

Markdown image syntax remains supported by the Markdown renderer:

```markdown
![Description](/assets/example.jpg)
```

However, the `prose` component provides no special image presentation. The
experimental `.c-prose img` sizing rule is removed. Markdown images receive
only normal browser behavior and any broadly applicable theme styles.

Authors use:

- `prose` for ordinary Markdown;
- `media-section` for one intentionally composed image and prose block;
- `gallery` for a collection of images.

### 9. `danrevel.com` migration

The Dan Revel home page becomes the first production use of `media-section`.
Its opening `prose` component and embedded Markdown portrait are replaced by:

```yaml
- type: media-section
  layout: image-right
  image:
    src: /assets/retired-cap.jpg
    alt: Dan Revel wearing a Retired cap
  markdown: |
    # Dan Revel

    **Retired software engineer. Lifelong builder and learner.**

    After more than 40 years in software engineering, I have traded the
    full-time career for something more open-ended: learning new tools,
    building experimental projects, riding bikes, traveling, and following
    interesting questions wherever they lead.
```

The home page uses a following `prose` component for the paragraphs beginning
"These days, many of those questions are about artificial intelligence," the
"What I am exploring now" section, and the closing quotation. This keeps the
side-by-side section concise and prevents a tall prose column from overwhelming
the portrait.

The portrait asset remains `/assets/retired-cap.jpg`.

---

## Files Changed

Expected implementation scope:

| File | Action |
|------|--------|
| `components/media-section/schema.json` | Create |
| `components/media-section/component.njk` | Create |
| `components/media-section/component.css` | Create |
| `scripts/validate-plan.sh` | Modify for recursive descriptors |
| `scripts/generate-catalog-md.sh` | Modify for descriptor documentation |
| `scripts/test/fixtures/valid-build-plan-media-section.yaml` | Create |
| `scripts/test/run-tests.sh` | Modify with schema, rendering, and CSS-bundle tests |
| `components/CATALOG.md` | Regenerate |
| `components/prose/component.css` | Remove experimental Markdown image styling |
| `$SITES_DIR/danrevel/build-plan.yaml` | Migrate home-page portrait to `media-section` |

No change is expected in `render-templates.sh`, `apply-theme.sh`,
`build-site.sh`, deployment scripts, Eleventy configuration, or the
top-level page schema.

---

## Deferred

- Multiple images in one `media-section`
- Arbitrary grids, rows, columns, spans, and coordinates
- Nested components or general container components
- Text wrapping or newspaper-style flow around images
- Author-controlled widths, gaps, breakpoints, or aspect ratios
- Cropping and `object-fit` controls
- Focal-point selection
- Remote-image fetching, optimization, resizing, or format conversion
- `srcset`, responsive image generation, and lazy-loading policy
- Markdown captions
- Image links
- Per-theme layout configuration

These features require separate concrete use cases and design decisions.

---

## Validation and Test Cases

The implementation plan must include tests for:

1. A complete `media-section` passes plan validation.
2. Each of the four layout values passes validation.
3. An unknown layout value fails.
4. Missing `image` fails.
5. Missing `image.src` fails.
6. Empty or whitespace-only `image.src` fails.
7. Missing `image.alt` fails.
8. Empty or whitespace-only `image.alt` fails.
9. A non-string `image.alt` fails.
10. An optional string caption passes.
11. An unknown nested image field fails with its full field path.
12. Existing primitive-only component schemas still validate unchanged.
13. Catalog generation documents enum and nested fields correctly.
14. Template rendering emits the `media-section` include.
15. A caption produces `<figcaption>` and an omitted caption does not.
16. The CSS bundle contains scoped `.c-media-section` rules.
17. All four layouts have the specified wide- and narrow-screen ordering.
18. The migrated Dan Revel site builds successfully with no Markdown image
    sizing rule in `prose`.

---

## Success Criteria

- `build-plan.yaml` can express one image paired with Markdown using
  `media-section`.
- Authors choose only among the four named layout intents.
- Left and right layouts become the specified single-column order on narrow
  screens.
- `src` and `alt` are enforced as non-empty strings.
- Unknown nested image fields are rejected.
- Existing component schemas remain valid without migration.
- The generated component catalog accurately documents the nested contract.
- Component CSS remains scoped and works under all existing themes.
- `danrevel.com` renders its portrait through `media-section`, not a Markdown
  image.
- Markdown images have no `prose`-component-specific sizing.
