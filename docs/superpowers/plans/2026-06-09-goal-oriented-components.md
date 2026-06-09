# Goal-Oriented Informational Components — Implementation Plan

> Execute task by task. Do not begin a later task until the current task's
> tests pass. Preserve unrelated working-tree changes. Stop before committing,
> pushing, connecting the custom domain, or deploying the lookbook until the
> user has reviewed the local product test.

**Goal:** Add six constrained communication-oriented components and build a
public-ready `demo.clodsite.com` lookbook that exercises them across the
existing theme system.

**Architecture:** Each component remains a standard self-contained catalog
directory with schema, Nunjucks template, and scoped CSS. The recursive schema
language gains bounded array maxima and safe href validation. Components use a
small shared semantic theme-token contract, never theme-name conditionals.
The lookbook is an ordinary Clodsite site using an optional site-level selector
that swaps among approved built-in theme stylesheets.

**Proposed design:**
[`docs/superpowers/specs/2026-06-09-goal-oriented-components-design.md`](../specs/2026-06-09-goal-oriented-components-design.md)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/validate-plan.sh` | Modify | Add `max_items`, `format: href`, and hero placement rules |
| `scripts/generate-catalog-md.sh` | Modify | Document array item fields and new constraints |
| `components/hero/*` | Create | Primary message, optional image, bounded actions |
| `components/feature-grid/*` | Create | Features and benefits |
| `components/key-facts/*` | Create | Scannable facts in a semantic definition list |
| `components/quote/*` | Create | Attributed quotation or testimonial |
| `components/resource-cards/*` | Create | Actionable resources/projects/services |
| `components/call-to-action/*` | Create | Focused strong or subtle next step |
| `scaffold/src/css/themes/*.css` | Modify | Add semantic component tokens |
| `scaffold/src/_includes/base.njk` | Modify | Render and operate the optional theme selector |
| `scripts/write-site-json.sh` | Modify | Emit validated selector configuration |
| `components/CATALOG.md` | Regenerate | Publish all new schemas |
| `scripts/test/fixtures/valid-build-plan-goal-components.yaml` | Create | Exercise every new component |
| `scripts/test/run-tests.sh` | Modify | Schema, rendering, accessibility, CSS, and build tests |
| `README.md` | Modify | Document the expanded catalog |
| `CLAUDE.md` | Modify | Document component semantics and demo |
| `ROADMAP.md` | Modify | Mark item complete after product verification |
| `$SITES_DIR/clodsite-demo/build-plan.yaml` | Create | Canonical lookbook plan |
| `$SITES_DIR/clodsite-demo/assets/` | Create | Lookbook imagery |

---

## Task 1: Extend Schema Descriptors

### Tests first

Add validator tests proving:

- `max_items` works for arrays;
- fewer than or equal to the maximum passes;
- exceeding the maximum fails with the full field path;
- non-integer, negative, and smaller-than-`min_items` values make the schema
  descriptor invalid;
- `format: href` accepts `/path/`, `#fragment`, valid `https://`, and
  `mailto:hello@example.com`;
- it rejects relative paths, `//host`, `http://`, empty-host HTTPS,
  `javascript:`, `data:`, CR, and LF;
- `format` on a non-string descriptor is invalid;
- unknown formats are invalid.

### Implementation

Add `max_items` and `format` to the allowed descriptor keys.

For `format: href`, validate only after type and non-empty checks succeed.
Keep the accepted protocol list exactly as defined in the design.

### Gate

Run:

```bash
bash scripts/test/run-tests.sh
```

---

## Task 2: Improve Catalog Generation

### Tests first

Use a temporary schema with nested object arrays and assert the generated
catalog includes:

- `items[]`;
- `items[].title`;
- nested optional image fields;
- minimum and maximum item counts;
- href format information.

### Implementation

Teach `generate-catalog-md.sh` to recurse into `descriptor.items` when the
array contains objects. Extend descriptor descriptions with:

- `at least N items`;
- `at most N items`; and
- `href` format.

Preserve existing output for primitive fields and nested objects.

### Gate

Run generator tests and the full shell suite.

---

## Task 3: Implement the Shared Action Contract Through `hero`

### Tests first

Create the `hero` schema and fixture coverage for:

- required heading and Markdown;
- zero, one, and two actions;
- three actions rejected;
- action label, href, and style validation;
- optional image and image position;
- unknown fields rejected;
- at most one hero per page;
- hero must be the first component.

Rendering/build assertions:

- semantic `<section>` and `<h1>`;
- escaped eyebrow, heading, labels, hrefs, and image values;
- Markdown body renders;
- primary and secondary action classes;
- no empty action or image wrappers;
- text precedes image in DOM at every configured image position;
- left/right modifier class changes only wide-screen placement.

### Implementation

Create:

- `components/hero/schema.json`
- `components/hero/component.njk`
- `components/hero/component.css`

Add focused page-level hero checks after ordinary component validation.
Do not generalize cross-component constraints beyond this concrete rule.

### Gate

Run fixture validation, fixture build, and full shell suite.

---

## Task 4: Implement `feature-grid` and `key-facts`

### Tests first

For `feature-grid`, cover:

- two through six items pass;
- one and seven fail;
- item title/text are required and non-empty;
- heading and intro are optional;
- output uses a list with section and item headings.

For `key-facts`, cover:

- two through six items pass;
- value and label are required;
- detail is optional;
- output uses `<dl>`, `<dt>`, and `<dd>`;
- all user values are escaped.

### Implementation

Create the standard three files for each component. Use CSS Grid with
component-owned responsive behavior and theme tokens only.

### Gate

Run focused and full tests.

---

## Task 5: Implement `quote`

### Tests first

Cover:

- required quote and attribution name;
- optional role and image;
- nested image validation;
- semantic blockquote/footer/cite markup;
- optional wrappers omitted cleanly;
- no Markdown or raw HTML interpretation inside the quotation;
- escaped user values.

### Implementation

Create the standard component files. Keep optional attribution imagery small
and uncropped. The CSS must work without an image and at narrow widths.

### Gate

Run focused and full tests.

---

## Task 6: Implement `resource-cards`

### Tests first

Cover:

- one through six cards pass;
- item title, description, and href are required;
- link label and image are optional;
- unsafe hrefs fail;
- each card renders as an `<article>`;
- every card exposes a visible link;
- default `Learn more` label appears when omitted;
- images and optional section heading/intro render correctly.

### Implementation

Create the standard component files. Cards are actionable resources, not a
generic nested-content system. Keep the whole card keyboard behavior honest:
render a normal visible link rather than JavaScript click handling.

### Gate

Run focused and full tests.

---

## Task 7: Implement `call-to-action`

### Tests first

Cover:

- required heading, Markdown, and one or two actions;
- absent emphasis defaults to strong;
- only strong/subtle accepted;
- semantic heading and action links;
- strong/subtle modifier classes;
- all user values escaped;
- no JavaScript.

### Implementation

Create the standard component files. Reuse the shared action schema shape by
duplicating its descriptor in `schema.json`; do not add schema references or a
new abstraction until another concrete need appears.

### Gate

Run focused and full tests.

---

## Task 8: Add the Theme Token Contract

### Tests first

Assert each theme defines:

```text
--color-muted
--color-border
--color-on-accent
--color-surface-raised
--shadow-card
```

Assert every new component stylesheet:

- is rooted under its `c-<name>` class;
- contains a narrow-screen rule when needed;
- does not reference a theme name;
- does not introduce fixed site-wide body or heading rules;
- provides visible `:focus-visible` treatment for actions and links.

### Implementation

Choose token values that preserve each current theme's personality. Refactor
only when necessary; leave unrelated theme rules alone.

Test all new components in minimal, professional, and bold builds.

### Gate

Run full tests and build the goal-components fixture three times.

---

## Task 9: Implement the Optional Live Theme Selector

### Tests first

Validation tests:

- absent selector preserves current behavior;
- enabled selector with two or three unique valid themes passes;
- default `style` must appear in enabled options;
- duplicate, unknown, non-array, and one-item option lists fail;
- non-boolean `enabled`, unknown object fields, and non-object selectors fail;
- disabled selector may use an empty option list.

Site-data and rendering tests:

- `write-site-json.sh` emits enabled state, ordered options, and default theme;
- fixed-theme sites emit a disabled selector state;
- the theme stylesheet link has a stable ID;
- enabled sites render a labeled select with exactly the configured options;
- disabled sites render no visible selector;
- all configured theme font links are emitted for enabled sites;
- fixed-theme sites still load only one theme's fonts;
- the inline script contains an allowlist derived from structured site data;
- query selection takes precedence over storage;
- valid query selection is persisted;
- invalid values fall back to the default;
- selection changes the stylesheet href and body class;
- selection updates the URL through `history.replaceState`;
- storage/history exceptions are caught;
- a `<noscript>` or CSS fallback keeps the selector hidden without JavaScript.

### Implementation

Add focused top-level validation for:

```yaml
theme_selector:
  enabled: true
  options: [minimal, professional, bold]
```

Emit this configuration through `site.json`. Update `base.njk` with:

- a stable `id="site-theme"` stylesheet link;
- a synchronous head bootstrap that resolves the approved theme;
- all configured font families for enabled selectors;
- an escaped, labeled select in the navigation, initially `hidden`;
- a small inline controller that applies and persists changes;
- body-class synchronization; and
- removal of `hidden` only after successful initialization.

Add theme-owned navigation styling for the selector to all three theme files,
including narrow-screen wrapping and visible focus.

Do not add a component, external dependency, page-level setting, or custom
theme URL.

### Gate

Run the full shell suite and test the selector in all three themes.

---

## Task 10: Regenerate Catalog and Update Product Documentation

Run:

```bash
bash scripts/generate-catalog-md.sh > components/CATALOG.md
```

Update:

- `README.md` with the goal-oriented catalog;
- `CLAUDE.md` with authoring guidance;
- the design status to Approved before implementation and Implemented only
  after product verification.

Catalog assertions must include all six component headings and nested action,
item, attribution, and image fields.

---

## Task 11: Build the `demo.clodsite.com` Lookbook

Create `$SITES_DIR/clodsite-demo/build-plan.yaml` with:

- slug `clodsite-demo`;
- name `Clodsite Component Lookbook`;
- style `bold`;
- enabled theme selector with minimal, professional, and bold options;
- custom domain `demo.clodsite.com`;
- distinct metadata descriptions;
- conservative static response headers;
- the five-page structure from the design.

Content requirements:

- realistic, publishable examples rather than lorem ipsum;
- every new component used at least once;
- existing `prose`, `media-section`, and `gallery` represented;
- each new specimen followed by its YAML source in a prose code block;
- form components documented but not live;
- links back to `clodsite.com` and GitHub.

Build through the normal pipeline. Do not deploy yet.

---

## Task 12: Verify Live Theme Switching

Build the demo once with `style: bold`. In the local browser, exercise:

- each selector option on at least two pages;
- direct `?theme=minimal`, `?theme=professional`, and `?theme=bold` URLs;
- persistence after navigating to another page;
- fallback from an invalid query value;
- reload behavior;
- narrow-screen selector wrapping;
- keyboard operation and visible focus; and
- default bold rendering with JavaScript disabled.

Confirm stylesheet href, body class, selected option, URL query, and visible
theme all agree after each transition.

Do not add screenshots, duplicate sites, per-page theme fields, or demo-only
theme CSS.

---

## Task 13: Visual and Accessibility Review

Use the local browser to inspect every demo page at desktop and narrow widths.

Check:

- no horizontal overflow;
- coherent heading hierarchy;
- visible keyboard focus;
- readable contrast;
- sensible stacking and action order;
- images preserve aspect ratio;
- cards remain legible with long titles and descriptions;
- action groups wrap rather than overflow;
- the selector remains usable and legible in each theme;
- switching themes causes no meaningful layout shift beyond font metrics;
- generated metadata and JSON-LD are valid;
- `_headers` is present.

Fix product components, not one-off demo CSS. The demo site must contain no
custom stylesheet.

---

## Task 14: Review Gate

Present:

- product-repository diff;
- demo build-plan diff;
- live local previews of representative pages in all three themes;
- automated test totals;
- local preview findings.

Stop for user approval before:

- committing or pushing either repository;
- deploying the Pages project;
- connecting `demo.clodsite.com`; or
- marking the roadmap item complete.

---

## Task 15: Deploy After Approval

After explicit approval:

1. deploy the `clodsite-demo` Pages project;
2. run finalization;
3. connect `demo.clodsite.com` through `scripts/domain.sh`;
4. smoke-test all routes, metadata, JSON-LD, headers, assets, and theme query
   links;
5. visually inspect and switch themes on the custom domain;
6. mark the design Implemented;
7. move the roadmap item to Completed;
8. run the full test suite again;
9. commit and push both repositories as separately reviewable commits.

---

## Final Verification

Product repository:

```bash
bash scripts/test/run-tests.sh
node --test mcp/pipeline.test.js
git diff --check
```

Lookbook:

```bash
SITE_NAME=clodsite-demo bash scripts/validate-plan.sh
SITE_NAME=clodsite-demo bash scripts/write-site-json.sh
SITE_NAME=clodsite-demo bash scripts/apply-theme.sh
SITE_NAME=clodsite-demo bash scripts/render-templates.sh
SITE_NAME=clodsite-demo bash scripts/render-functions.sh
SITE_NAME=clodsite-demo bash scripts/build-site.sh
SITE_NAME=clodsite-demo bash scripts/render-headers.sh
```

Expected:

- all tests pass;
- all eleven catalog components remain valid;
- every new component renders safely under live switching among all three themes;
- the demo is an ordinary Clodsite build with no custom CSS;
- deployment and domain work remain pending until the review gate.
