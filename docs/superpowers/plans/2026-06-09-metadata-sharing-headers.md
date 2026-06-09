# Metadata, Sharing, and Response Headers — Implementation Plan

> Execute this plan task by task. Do not begin a later task until the current
> task's tests pass. Preserve unrelated working-tree changes.

**Goal:** Add constrained site/page metadata and explicit Cloudflare Pages
response-header rules to `build-plan.yaml`, then deterministically render
search, sharing, structured-data, and `_headers` output.

**Architecture:** Optional top-level `head` defaults and `pages[].head`
overrides are validated before rendering. `render-templates.sh` resolves each
page into a `pageHead` front-matter object; the base layout renders escaped
metadata and safely serialized generic JSON-LD. A new post-Eleventy
`render-headers.sh` writes `dist/_headers` directly from validated top-level
rules.

**Approved design:**
[`docs/superpowers/specs/2026-06-09-metadata-sharing-headers-design.md`](../specs/2026-06-09-metadata-sharing-headers-design.md)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/validate-plan.sh` | Modify | Validate site/page metadata and header rules |
| `scripts/render-templates.sh` | Modify | Resolve metadata, URLs, images, and JSON-LD |
| `scripts/render-headers.sh` | Create | Generate or remove `dist/_headers` |
| `scripts/build-deploy.sh` | Modify | Run `render-headers.sh` after Eleventy |
| `scaffold/.eleventy.js` | Modify | Add safe `jsonScript` filter |
| `scaffold/src/_includes/base.njk` | Modify | Render metadata tags and JSON-LD |
| `.claude/commands/build.md` | Modify | Add response-header rendering step |
| `.claude/commands/plan.md` | Modify | Teach legacy planning the optional fields |
| `mcp/pipeline.js` | Modify | Add pipeline step and update field reference |
| `mcp/pipeline.test.js` | Modify | Assert pipeline and field-reference behavior |
| `scripts/test/fixtures/valid-build-plan-metadata.yaml` | Create | Exercise defaults, overrides, image, and headers |
| `scripts/test/run-tests.sh` | Modify | Cover validation and generated artifacts |
| `README.md` | Modify | Document capability |
| `CLAUDE.md` | Modify | Document contract and pipeline |
| `ROADMAP.md` | Modify | Move roadmap item to completed |

---

## Task 1: Validate Metadata

### Tests first

Add fixtures or temporary plan mutations proving:

- absent `head` remains valid;
- top-level description and image are valid;
- page description and image overrides are valid;
- empty descriptions fail with the full field path;
- image missing `src` or `alt` fails;
- empty image fields fail;
- non-object `head` and `image` values fail;
- unknown fields in either object fail;
- image `src` accepts `/assets/share.png` and `https://example.com/share.png`;
- image `src` rejects relative paths, protocol-relative URLs, and non-HTTPS
  external URLs.

### Implementation

Add focused helper functions in the validator rather than routing these
top-level objects through component-schema descriptors. Validate both
`plan.head` and every `pages[i].head`.

Keep all new fields optional. Description fallback behavior belongs to
rendering, not validation.

### Gate

Run:

```bash
bash scripts/test/run-tests.sh
```

Expected: all tests pass.

---

## Task 2: Validate Response Headers

### Tests first

Cover:

- a valid global rule;
- a valid asset-path rule;
- a valid absolute `https://` rule;
- empty and non-array `headers`;
- more than 100 rules;
- missing, empty, malformed, and duplicate paths;
- missing, empty, and non-object `values`;
- invalid header names;
- empty, non-string, CR-containing, and LF-containing values;
- removal syntax beginning with `!`;
- unknown rule fields;
- generated lines over 2,000 characters.

### Implementation

Validate the direct Cloudflare-shaped contract:

```yaml
headers:
  - path: /*
    values:
      X-Content-Type-Options: nosniff
```

Use a case-insensitive set when checking duplicate header names if the parsed
representation permits differently cased keys. Reject duplicate paths exactly
after trimming.

Do not add defaults, removal syntax, arrays, or component contributions.

### Gate

Run the full shell suite.

---

## Task 3: Resolve Page Metadata

### Tests first

Extend render-template tests to assert generated front matter contains:

- `overview` as the description fallback;
- top-level `head.description` overriding `overview`;
- page description overriding the site default;
- site image inherited by a page;
- page image overriding the site image;
- canonical `/` for the first page;
- canonical page permalinks for other pages;
- absolute conversion of root-relative image paths;
- preservation of absolute HTTPS image URLs;
- absent canonical and social image URL when no `custom_domain` exists;
- a warning for an unresolved root-relative share image.

### Implementation

In `render-templates.sh`:

1. derive the canonical origin from non-empty `custom_domain`;
2. resolve description and image field-by-field;
3. derive full title using the existing browser-title convention;
4. derive canonical and absolute image URLs;
5. construct a generic JSON-LD `@graph` only when canonical URLs exist;
6. serialize the resolved object into one-line YAML-compatible JSON as
   `pageHead`.

Do not duplicate metadata into `site.json`.

### Gate

Run render-template tests and then the full shell suite.

---

## Task 4: Render Safe `<head>` Markup

### Tests first

Build the metadata fixture and assert:

- one description meta tag;
- canonical and `og:url` values;
- Open Graph title, description, type, site name, image, and image alt;
- Twitter title, description, card, image, and image alt;
- `summary_large_image` with an image and `summary` without one;
- one JSON-LD script with `WebSite` and `WebPage`;
- page-to-site `isPartOf` linkage;
- valid JSON after extracting the script body;
- quotes and ampersands are escaped in HTML attributes;
- `</script>` in a description cannot terminate the JSON-LD script.

### Implementation

Add `jsonScript` to `scaffold/.eleventy.js`:

```javascript
JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029')
```

Update `base.njk` to render `pageHead` conditionally. Apply Nunjucks `escape`
to every metadata attribute and `jsonScript | safe` only to the already
structured JSON-LD object.

Preserve the existing title and favicon behavior.

### Gate

Run the fixture build tests and full shell suite.

---

## Task 5: Generate Cloudflare `_headers`

### Tests first

Add tests proving:

- no configured rules leave `dist/_headers` absent;
- configured rules produce the exact expected file;
- plan order and header insertion order are preserved;
- output ends with a newline;
- a stale `_headers` file is removed when rules disappear;
- paths and values containing shell-sensitive characters are written
  literally, not evaluated.

### Implementation

Create executable `scripts/render-headers.sh`. It must:

- resolve `SITE_DIR` through `scripts/lib/sites.sh`;
- require `build-plan.yaml` and an existing `dist/`;
- remove stale `dist/_headers` before deciding whether output is needed;
- parse YAML through `js-yaml`;
- write Cloudflare's multi-line block format;
- avoid shell interpolation of plan values.

The validator remains the policy point; this renderer assumes a valid plan but
still fails clearly on unreadable input.

### Gate

Run focused tests, `bash -n scripts/render-headers.sh`, and the full shell suite.

---

## Task 6: Wire Every Build Path

### Tests first

Update MCP/pipeline tests to assert the new step appears after
`build-site.sh` and before `deploy.sh`.

Add or update a wrapper test proving `scripts/build-deploy.sh` calls the same
order where practical; otherwise assert the script order textually.

### Implementation

Add:

```text
render-headers.sh
```

after `build-site.sh` in:

- `.claude/commands/build.md`;
- `scripts/build-deploy.sh`; and
- `mcp/pipeline.js`.

The deploy-only command does not render headers. Deploying assumes the site was
built through a supported build path.

### Gate

Run shell and MCP tests.

---

## Task 7: Update Authoring Documentation

Update:

- `.claude/commands/plan.md` with optional `head`, page overrides, and
  `headers`;
- `mcp/pipeline.js#getSchema()` full-plan reference with the same fields;
- `README.md` capability and build-plan descriptions;
- `CLAUDE.md` build contract, generated artifacts, and pipeline.

Document these operational facts:

- `custom_domain` enables canonical URLs for deterministic builds;
- local share-image paths need `custom_domain` to become absolute;
- `_headers` applies only to static Pages responses;
- Pages Functions must attach their own response headers;
- overlapping Cloudflare rules are additive.

Run documentation-sensitive tests after updating the MCP reference.

---

## Task 8: Product Test on `clodsite.com`

Update the Clodsite site's build plan in the separate sites repository:

- add a concise site description;
- add distinct page descriptions;
- add a share image only if an appropriate asset is available;
- add an explicit conservative header policy:

```yaml
headers:
  - path: /*
    values:
      X-Content-Type-Options: nosniff
      Referrer-Policy: strict-origin-when-cross-origin
```

Do not add CSP in this increment because the site loads Google Fonts and may
later contain Turnstile-backed forms.

Build and inspect:

- all five page `<head>` blocks;
- JSON-LD validity;
- `dist/_headers`;
- no content or navigation regression.

Deploy only after user approval of the generated product-test diff.

After deployment, verify with `curl`:

- live HTML metadata;
- canonical URLs;
- `X-Content-Type-Options`;
- `Referrer-Policy`;
- no unexpected header on Pages Function responses, if any exist.

---

## Task 9: Finish Documentation and Roadmap

After implementation and product verification:

- mark the design `Implemented`;
- move "Metadata, sharing, and response headers" from Pending to Completed in
  `ROADMAP.md`;
- record the shipped contract and Cloudflare limitations;
- run `git diff --check`.

---

## Final Verification

Run:

```bash
bash scripts/test/run-tests.sh
node --test mcp/pipeline.test.js
```

Then build the metadata fixture and inspect:

```bash
grep -R '<meta\\|canonical\\|application/ld+json' "$SITE_DIR/dist"
cat "$SITE_DIR/dist/_headers"
```

Expected:

- all automated tests pass;
- existing build plans remain valid;
- metadata is escaped and structurally correct;
- JSON-LD parses;
- `_headers` is deterministic and stale-safe;
- every supported build/deploy entry point includes the new renderer.
