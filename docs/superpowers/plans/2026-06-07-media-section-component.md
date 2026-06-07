# `media-section` Component Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Do not begin a later
> task until the current task's tests pass. Preserve unrelated working-tree
> changes.

**Goal:** Add a constrained `media-section` catalog component that pairs one
image with one Markdown block in four responsive layouts, extend component
schemas with recursive nested-object validation, and migrate the
`danrevel.com` home-page portrait from a Markdown image to the new component.

**Architecture:** Existing primitive schema declarations such as
`"markdown": "string"` remain valid. `validate-plan.sh` gains a recursive
descriptor validator supporting `type`, string `enum`, string `non_empty`, and
object `required`/`optional` fields. `generate-catalog-md.sh` renders these
descriptors as readable field paths. The new component remains self-contained
under `components/media-section/`; existing rendering and CSS-bundling scripts
discover it without special cases.

**Tech Stack:** Bash, Node.js, `js-yaml`, Nunjucks, Markdown-It, Eleventy, CSS
Grid, Cloudflare Pages.

**Approved design:**
[`docs/superpowers/specs/2026-06-07-media-section-component-design.md`](../specs/2026-06-07-media-section-component-design.md)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/test/fixtures/valid-build-plan-media-section.yaml` | Create | Valid component fixture covering nested image fields |
| `scripts/test/run-tests.sh` | Modify | Validator, catalog, template, markup, CSS-bundle, and build tests |
| `scripts/validate-plan.sh` | Modify | Recursive schema-descriptor validation |
| `scripts/generate-catalog-md.sh` | Modify | Human-readable enum and nested-field documentation |
| `components/media-section/schema.json` | Create | Component contract and complete YAML example |
| `components/media-section/component.njk` | Create | Semantic prose, figure, image, and optional caption markup |
| `components/media-section/component.css` | Create | Four layouts and responsive stacking |
| `components/CATALOG.md` | Regenerate | LLM-facing component documentation |
| `components/prose/component.css` | Modify | Remove experimental Markdown-image sizing |
| `$SITES_DIR/danrevel/build-plan.yaml` | Modify | Replace Markdown portrait with `media-section` |

No changes are planned for `render-templates.sh`, `apply-theme.sh`,
`build-site.sh`, deployment scripts, Eleventy configuration, or the page-level
schema.

---

### Task 1: Add recursive schema-descriptor validation

**Files:**
- Create: `scripts/test/fixtures/valid-build-plan-media-section.yaml`
- Modify: `scripts/test/run-tests.sh`
- Modify: `scripts/validate-plan.sh`

- [ ] **Step 1: Create the valid fixture**

Create `scripts/test/fixtures/valid-build-plan-media-section.yaml`:

```yaml
slug: media-section-test
name: Media Section Test
overview: Fixture for media-section validation and rendering.
style: minimal
tone: friendly
pages:
  - id: home
    title: Home
    components:
      - type: media-section
        layout: image-right
        image:
          src: /assets/portrait.jpg
          alt: A portrait used by the media-section test
          caption: Optional caption
        markdown: |
          # Hello

          This prose is paired with one image.
nav:
  order: [home]
contact:
  enabled: false
```

The fixture will remain invalid until the component schema is created in
Task 2. Task 1 validator tests therefore use an isolated temporary component
schema instead of the production catalog.

- [ ] **Step 2: Add a temporary-schema validation test helper**

In the `validate-plan.sh` section of `scripts/test/run-tests.sh`, create a
temporary components directory containing:

```json
{
  "description": "Nested validation test component.",
  "required": {
    "layout": {
      "type": "string",
      "enum": ["image-left", "image-right", "image-above", "image-below"]
    },
    "image": {
      "type": "object",
      "required": {
        "src": { "type": "string", "non_empty": true },
        "alt": { "type": "string", "non_empty": true }
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

Copy the fixture to `${SITE_DIR}/build-plan.yaml`, rename its component type to
the temporary schema directory name if necessary, and invoke validation with
`COMPONENTS_DIR=<temporary-dir>`.

Add assertions for:

- valid nested object exits `0`;
- all four enum values exit `0`;
- unknown layout exits `1` and names the full `layout` path;
- missing `image` exits `1`;
- missing `image.src` exits `1` and names `.image.src`;
- empty and whitespace-only `image.src` exit `1`;
- missing `image.alt` exits `1` and names `.image.alt`;
- empty and whitespace-only `image.alt` exit `1`;
- non-string `image.alt` exits `1`;
- string `image.caption` exits `0`;
- unknown `image.width` exits `1` and names `.image`;
- the existing `valid-build-plan-components.yaml` still exits `0` against the
  production primitive-only schemas.

Capture validator output for path assertions instead of discarding it.

- [ ] **Step 3: Run the new validator tests and confirm failure**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "nested|layout|image\\.(src|alt)|unknown image field|Results"
```

Expected: the new descriptor-based tests fail because `checkType` accepts only
primitive type strings and does not recurse.

- [ ] **Step 4: Replace primitive-only validation with recursive validation**

In the Node program embedded in `scripts/validate-plan.sh`:

1. Keep `checkType(value, type)` for primitive checks.
2. Add `validateValue(value, descriptor, fieldPath, errors)`.
3. Treat a string descriptor as the existing primitive declaration.
4. Reject descriptor objects without a string `type`.
5. Check the descriptor's base type before applying additional rules.
6. For `type: "string"`:
   - apply `enum` with exact string matching;
   - apply `non_empty` using `value.trim().length > 0`.
7. For `type: "object"`:
   - recursively validate every nested required field;
   - recursively validate each present optional field;
   - reject keys absent from both maps.
8. Emit full paths rooted at the component tag, such as
   `pages[0].components[0].image.alt`.
9. Preserve the existing top-level rule that `type` is allowed on every
   component but is not declared in component schemas.

Use these exact message shapes:

```text
<path> is required
<path> must be <type>
<path> must be a non-empty string
<path> must be one of: <comma-separated enum values>
<object-path> has unknown field "<field>"
```

The validator must not silently accept malformed schema descriptors. If a
descriptor has an unsupported shape, add a validation error naming the schema
path rather than treating it as valid.

- [ ] **Step 5: Run the full script suite**

```bash
bash scripts/test/run-tests.sh
```

Expected: all old tests and all new recursive-validator tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/test/fixtures/valid-build-plan-media-section.yaml \
        scripts/test/run-tests.sh \
        scripts/validate-plan.sh
git commit -m "feat(schema): validate nested component fields"
```

---

### Task 2: Add the schema and catalog documentation

**Files:**
- Create: `components/media-section/schema.json`
- Modify: `scripts/generate-catalog-md.sh`
- Modify: `scripts/test/run-tests.sh`
- Regenerate: `components/CATALOG.md`

- [ ] **Step 1: Add failing catalog tests**

Extend the `generate-catalog-md.sh` test section to require:

- `## media-section`;
- all four layout values;
- `image.src` marked required and non-empty;
- `image.alt` marked required and non-empty;
- `image.caption` marked optional;
- a complete `type: media-section` YAML example;
- unchanged primitive output such as `` `markdown` (string) ``.

Run:

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "catalog.*media|catalog.*layout|catalog.*image|Results"
```

Expected: failures because the schema does not exist and descriptor objects
would currently stringify as `[object Object]`.

- [ ] **Step 2: Create `components/media-section/schema.json`**

Use the descriptor shape from the approved design:

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
  "optional": {},
  "example": "type: media-section\nlayout: image-right\nimage:\n  src: /assets/portrait.jpg\n  alt: Description of the portrait\n  caption: Optional plain-text caption\nmarkdown: |\n  ## Heading\n\n  Prose paired with the image.\n"
}
```

- [ ] **Step 3: Teach catalog generation to describe descriptors**

Refactor `scripts/generate-catalog-md.sh` with small Node helpers:

- `describeDescriptor(descriptor)` returns `string` for primitive declarations,
  `string; one of: ...` for enums, and `object` for nested objects;
- `renderFields(fields, prefix, required)` recursively emits dotted paths;
- non-empty strings include `non-empty`;
- nested required and optional fields retain their own status;
- `schema.example`, when present, renders under an `**Example:**` heading in a
  fenced `yaml` block.

Do not change existing primitive field labels except to add examples from
their already-present `schema.example` values. Output remains deterministic by
iterating object entries in schema order and component directories
alphabetically.

- [ ] **Step 4: Regenerate the committed catalog**

```bash
bash scripts/generate-catalog-md.sh > components/CATALOG.md
```

Inspect the `media-section` entry and confirm it is sufficient for an agent to
author the component without opening `schema.json`.

- [ ] **Step 5: Run validation and catalog tests**

```bash
SITE_DIR="$(mktemp -d)" \
  bash -c 'cp scripts/test/fixtures/valid-build-plan-media-section.yaml "$SITE_DIR/build-plan.yaml" && bash scripts/validate-plan.sh'
bash scripts/test/run-tests.sh
```

Expected: the production `media-section` schema validates the fixture and the
full suite passes.

- [ ] **Step 6: Commit**

```bash
git add components/media-section/schema.json \
        components/CATALOG.md \
        scripts/generate-catalog-md.sh \
        scripts/test/run-tests.sh
git commit -m "feat(media-section): add schema and catalog contract"
```

---

### Task 3: Implement semantic markup and responsive layouts

**Files:**
- Create: `components/media-section/component.njk`
- Create: `components/media-section/component.css`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Add failing rendering and bundle tests**

Extend the test suite to:

1. Copy `valid-build-plan-media-section.yaml` into `${SITE_DIR}`.
2. Run `render-templates.sh`.
3. Assert `src/index.njk` includes `media-section/component.njk`.
4. Run `apply-theme.sh`.
5. Assert generated `scaffold/src/css/components.css` contains:
   - `.c-media-section`;
   - all four modifier classes;
   - a media query;
   - scoped image rules.
6. Run Eleventy for the fixture using a temporary empty portrait file or a
   copied image fixture under `${SITE_DIR}/assets/portrait.jpg`.
7. Assert generated HTML contains:
   - the root and modifier classes;
   - rendered Markdown;
   - `<figure>`;
   - correct `src` and `alt`;
   - `<figcaption>` when caption is present.
8. Repeat without `caption` and assert `<figcaption>` is absent.

Run the focused tests and confirm failure because the component template and
CSS do not exist.

- [ ] **Step 2: Create `component.njk`**

Render one `<section>` with:

- `c-media-section`;
- `c-media-section--{{ component.layout }}`;
- one `.c-media-section__prose` block using
  `{{ component.markdown | md | safe }}`;
- one `.c-media-section__media` `<figure>`;
- `<img src="{{ component.image.src }}" alt="{{ component.image.alt }}">`;
- conditional plain-text `<figcaption>`.

Choose DOM order by layout:

- `image-left` and `image-above`: figure before prose;
- `image-right` and `image-below`: prose before figure.

Do not add inline styles or JavaScript.

- [ ] **Step 3: Create `component.css`**

Implement neutral scoped defaults:

- root section spacing;
- zero default figure margin;
- responsive image with natural aspect ratio;
- subdued caption typography;
- `image-left` and `image-right` use a two-column grid above the breakpoint;
- `image-above` and `image-below` remain one column;
- all layouts are one column below the breakpoint;
- modifier classes explicitly place prose and media on wide screens;
- no rounded corners, shadows, borders, backgrounds, cropping, or fixed image
  heights.

Use one documented breakpoint and one component-owned column ratio. Suggested
initial values for implementation and review:

```css
grid-template-columns: minmax(0, 3fr) minmax(16rem, 2fr);
gap: clamp(2rem, 5vw, 4rem);
@media (max-width: 48rem) { ... }
```

For `image-left`, reverse the column assignment while keeping the image width
bounded by its grid column. Treat these values as implementation defaults,
not build-plan API.

- [ ] **Step 4: Run the full suite**

```bash
bash scripts/test/run-tests.sh
```

Expected: all rendering, caption, CSS bundle, and existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/media-section/component.njk \
        components/media-section/component.css \
        scripts/test/run-tests.sh
git commit -m "feat(media-section): render responsive image and prose layouts"
```

---

### Task 4: Remove the Markdown-image experiment and migrate Dan's plan

**Files:**
- Modify: `components/prose/component.css`
- Modify: `/Users/danrevel/lab/projects/clodsite-sites/danrevel/build-plan.yaml`

- [ ] **Step 1: Remove component-specific Markdown image styling**

Restore `components/prose/component.css` to a comment-only file with no
`.c-prose img` rule. Do not add replacement image sizing to a theme.

- [ ] **Step 2: Replace the home-page opening component**

In the Dan site plan, replace the current first `prose` component with:

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

Add a following `prose` component containing, unchanged:

- the paragraph beginning "These days, many of those questions...";
- the paragraph beginning "Retirement, to me...";
- the "What I am exploring now" heading and list;
- the closing technology quotation.

The Markdown image line must be removed.

- [ ] **Step 3: Validate and build the real site**

```bash
SITE_NAME=danrevel bash scripts/validate-plan.sh
SITE_NAME=danrevel bash scripts/write-site-json.sh
SITE_NAME=danrevel bash scripts/apply-theme.sh
SITE_NAME=danrevel bash scripts/render-templates.sh
SITE_NAME=danrevel bash scripts/build-site.sh
```

Expected:

- plan validation reports four pages;
- build emits four HTML files;
- home HTML contains `c-media-section--image-right`;
- home HTML contains the portrait exactly once;
- generated component CSS contains no `.c-prose img`.

- [ ] **Step 4: Run repository tests**

```bash
bash scripts/test/run-tests.sh
```

Expected: all tests pass with the experimental CSS removed.

- [ ] **Step 5: Commit Clodsite and site-repository changes separately**

In the Clodsite repository:

```bash
git add components/prose/component.css
git commit -m "refactor(prose): leave image layout to media components"
```

In the configured sites repository:

```bash
git add danrevel/build-plan.yaml danrevel/dist/
git commit -m "feat(danrevel): use media section for home portrait"
```

Do not stage unrelated files in either repository.

---

### Task 5: Visual verification and deployment

**Files:**
- No source changes expected
- Generated deployment metadata may update under
  `/Users/danrevel/lab/projects/clodsite-sites/danrevel/`

- [ ] **Step 1: Create a temporary four-layout visual fixture**

Use a temporary site directory outside the committed site plan. Build one page
containing four `media-section` components, one per layout, with short labeled
prose and the same portrait image.

- [ ] **Step 2: Inspect wide-screen behavior**

Serve or open the temporary build and verify at a desktop viewport:

- `image-left`: image left, prose right;
- `image-right`: prose left, image right;
- `image-above`: image above prose;
- `image-below`: prose above image;
- no image is cropped or stretched;
- captions align with their images;
- headings, links, lists, and paragraphs retain theme typography.

- [ ] **Step 3: Inspect narrow-screen behavior**

At a mobile viewport below the component breakpoint, verify:

- `image-left` becomes image above prose;
- `image-right` becomes prose above image;
- `image-above` remains image above prose;
- `image-below` remains prose above image;
- no horizontal overflow occurs;
- DOM and visual reading order agree.

- [ ] **Step 4: Inspect the real Dan home page locally**

Verify the portrait and opening copy form a balanced two-column section on
desktop, followed by the remaining prose at full content width. Verify the
portrait follows the opening paragraph on mobile because the selected layout
is `image-right`.

If visual tuning is necessary, change only component-owned CSS defaults. Do
not add width or breakpoint fields to the schema.

- [ ] **Step 5: Run final quality gates**

```bash
bash scripts/test/run-tests.sh
SITE_NAME=danrevel bash scripts/validate-plan.sh
git diff --check
```

Review `git status --short` in both repositories and confirm no unrelated
files will be staged by deployment finalization.

- [ ] **Step 6: Deploy the approved result**

```bash
SITE_NAME=danrevel bash scripts/deploy.sh
SITE_NAME=danrevel bash scripts/deploy-finalize.sh
```

Verify:

```bash
curl -sS https://danrevel.com | grep -F 'c-media-section--image-right'
curl -sS https://danrevel.com/css/components.css | grep -F '.c-media-section'
```

Open `https://danrevel.com` at desktop and mobile widths for final visual
confirmation.

- [ ] **Step 7: Commit any approved CSS tuning**

If Step 4 changed component CSS, commit it in the Clodsite repository before
the final deployment. If deployment finalization generated a sites-repository
commit, inspect it to confirm it contains only expected Dan site artifacts.

---

## Completion Criteria

The implementation is complete only when:

- all script tests pass;
- all four layout values validate and render;
- nested required fields, non-empty strings, enums, and unknown nested fields
  are enforced;
- primitive component schemas remain backward-compatible;
- `CATALOG.md` documents the complete nested contract and YAML example;
- markup is semantic and captions are conditional;
- wide- and narrow-screen ordering matches the approved design;
- the `prose` component has no special image sizing;
- the Dan home page uses `media-section` and builds successfully;
- `danrevel.com` is deployed and visually verified at desktop and mobile
  widths.

