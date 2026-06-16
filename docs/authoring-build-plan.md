# Authoring a Clodsite `build-plan.yaml`

Read this first. It tells you everything you need to author a site without
reading the engine's source. Pair it with `components/CATALOG.md` (the component
vocabulary). The contract you produce is one file:
`$SITES_DIR/<site-name>/build-plan.yaml`. Everything after it is deterministic
scripts — no further content decisions happen at build time.

## The shape of a plan

```yaml
slug: acme                      # site dir name (matches <site-name>)
name: Acme Co.                  # human-readable display name
overview: >-                    # one paragraph: purpose, audience, tone
  ...
style: minimal                  # minimal | professional | bold  → selects a theme
tone: friendly                  # professional | casual | technical | friendly
custom_domain: ""               # hostname only, or "" for none
head:                           # optional site-wide metadata defaults
  description: ...              # default search/social description
  image:                        # optional social image
    src: /assets/og.png         # site-root path or absolute https:// URL
    alt: ...
pages:
  - id: home                    # lowercase, hyphens only; unique
    title: Home
    head:                       # optional per-page description/image overrides
      description: ...
    components:                 # ORDERED list; renders top to bottom
      - type: hero
        # ...fields per the component's schema in CATALOG.md
nav:
  order: [home, about]          # must list every page id
contact:
  enabled: true
  email: hello@acme.example     # omit this key if enabled is false
headers:                        # optional Cloudflare Pages response headers
  - path: /*
    values: { X-Content-Type-Options: nosniff }
```

## Build and verify (exact commands)

From the Clodsite repo root, build the whole pipeline for a site:

```bash
for s in validate-plan write-site-json apply-theme render-templates \
         render-functions build-site render-headers; do
  SITE_NAME=<site-name> bash scripts/$s.sh || { echo "BUILD FAILED at $s"; break; }
done
```

- `validate-plan` runs first and rejects unknown components / malformed config —
  fix the plan and re-run.
- Verify output by reading the generated HTML in `$SITES_DIR/<site-name>/dist/`.
  Do **not** start a dev server to check — it blocks.
- First-time setup in a fresh checkout/worktree: run `npm install` in the repo
  root once, or `validate-plan` fails with `ERR_MODULE_NOT_FOUND`.

## Components

- Pages are **ordered arrays of typed components**. Use only types listed in
  `components/CATALOG.md`; the validator rejects anything else.
- `prose` is the default for textual content (GFM markdown). The other
  components are constrained — they accept only the fields their schema lists; you
  do not control columns, colors, spacing, or layout.
- **Do not hand-write interactive HTML/JS or inject `<script>` into `prose` as an
  escape hatch.** `prose` is for prose. For behavior the catalog can't express,
  author a component (next section) — not raw code in content.

## Non-obvious behaviors (the things you'd otherwise have to discover)

- **Reskin = change `style`.** `minimal` / `professional` / `bold` select a
  built-in theme applied site-wide. Changing the visual look is a one-line edit;
  you never write CSS in the plan.
- **`catalog` renders display-only when there is no top-level `commerce:` block.**
  Provide `commerce/catalog.json` and use the `catalog` component to show products
  with no checkout (see "The commerce catalog" below). Add a `commerce:` block only
  for live Stripe checkout (which also needs deploy-time KV provisioning).
- **Assets live with the site:** general images under `<site>/assets/`, product
  images under `<site>/commerce/assets/`, favicons auto-detected under
  `<site>/assets/favicons/`. Reference them by site-root path.
- **`contact.enabled: true` + `email`** renders a mailto in the footer site-wide.
- **`nav.order` must list every page id**; nav appears on every page.
- Root-relative social images become absolute when `custom_domain` is set.

## The commerce catalog (`commerce/catalog.json`)

Products are defined in `<site>/commerce/catalog.json`. The top-level shape is
`{ "products": [ ... ] }`. Each product:

| Field | Required | Notes |
|---|---|---|
| `slug` | yes | `[A-Za-z0-9][A-Za-z0-9_-]*`, unique |
| `name` | yes | non-empty string |
| `description` | yes | non-empty string (put weight/size here — there's no size field) |
| `price_minor` | yes | non-negative **integer minor units** (`1600` = $16.00; currency defaults to `usd`) |
| `active` | yes | boolean |
| `images.main` | yes | local path — `commerce/assets/…` or a site-root `/…` (no URLs) |
| `images.gallery` | no | array of local paths |
| `options`, `variants` | no | **omit for display-only**; needed only for live checkout with variant choices |
| `size_guide`, `personalization` | no | advanced; see the commerce design spec |

Minimal display-only catalog:

```json
{
  "products": [
    {
      "slug": "ridgeline-blend",
      "name": "Ridgeline Blend",
      "description": "Everyday cup: balanced, smooth, a little chocolatey. 12 oz whole-bean bag.",
      "price_minor": 1600,
      "active": true,
      "images": { "main": "commerce/assets/ridgeline-blend.svg" }
    }
  ]
}
```

## Extending the vocabulary (when the catalog can't express it)

If a request needs a shape no component covers — an interactive widget, a
structured layout the catalog lacks — **author a component**, do not inject raw
code into a page.

**1. Create `components/<name>/` with three files:**

- `schema.json` — declares the component's fields. Top-level keys:
  `description` (string), `required` (object of field → descriptor), `optional`
  (object of field → descriptor), and `example` (a YAML string shown in the
  catalog). A **descriptor** is either a type-name string
  (`"string" | "array" | "object" | "number" | "boolean"`) or an object
  `{ "type": <name>, ...rules }`. Available rules:

  | Rule | Applies to | Meaning |
  |---|---|---|
  | `non_empty: true` | string | reject empty/whitespace |
  | `enum: [...]` | string | value must be one of |
  | `format: "href"` | string | safe link (site-root `/…`, `https://`, `#frag`, or `mailto:`) |
  | `items: <descriptor>` | array | shape of each element |
  | `min_items` / `max_items` | array | element-count bounds |
  | `required` / `optional` | object | nested field descriptors |

  (`number`/`boolean` take no extra rules.) Example:

  ```json
  {
    "description": "Live brew-ratio calculator.",
    "required": {},
    "optional": {
      "heading": { "type": "string", "non_empty": true },
      "default_cups": "number",
      "ratio": "number"
    },
    "example": "type: brew-calculator\nheading: Brew calculator\ndefault_cups: 2\nratio: 16\n"
  }
  ```

- `component.njk` — the template. Read plan fields from `component.<field>`.
  **Interactive components carry their own inline `<script>`** using the
  `document.currentScript` convention (see `components/mailto-form/component.njk`):

  ```njk
  <div class="c-brew-calculator" data-ratio="{{ component.ratio or 16 }}">
    ...inputs and output nodes...
    <script>
      (function () {
        var root = document.currentScript.closest('.c-brew-calculator');
        // read data-* config, bind input listeners, recompute on change
      })();
    </script>
  </div>
  ```

  This keeps the JS scoped to the component instance — not raw script in `prose`.

- `component.css` — styles, ideally themed via the same CSS variables the
  built-in components use so it adapts to `style`.

**2. Regenerate the catalog reference:** `bash scripts/generate-catalog-md.sh`
(it writes `components/CATALOG.md`).

**3. Reference the new `type`** from a page's `components` array and build.

The component stays a typed, validated, reusable contract — the same governance
every built-in component has. (Per-site "site-local" libraries are planned but
not yet available, so today a new component is added to the shared catalog.)
