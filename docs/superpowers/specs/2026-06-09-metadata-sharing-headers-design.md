# Metadata, Sharing, and Response Headers — Design

**Date:** 2026-06-09
**Status:** Implemented
**Related roadmap entry:** "Metadata, sharing, and response headers"
**Extends:** `docs/superpowers/specs/2026-05-31-static-assets-favicons-design.md`

---

## Background

Clodsite currently renders only a browser title and favicon in `<head>`.
Pages have no descriptions, canonical URLs, social-sharing metadata, or
structured data. Clodsite also cannot generate Cloudflare Pages `_headers`.

Targeted informational websites need to:

- describe each page to search engines and link-preview crawlers;
- identify the preferred public URL for duplicate-content handling;
- present intentional titles, descriptions, and images when shared;
- provide basic machine-readable site and page context; and
- configure static response headers without hand-editing generated output.

This feature is the second slice anticipated by the static-assets and favicons
design. It should remain constrained and deterministic: the build plan supplies
editorial intent, while Clodsite derives URLs and markup.

## Goals

- Add site-wide metadata defaults with optional page-specific overrides.
- Preserve all existing build plans without migration.
- Generate description, canonical, Open Graph, and Twitter Card markup.
- Generate conservative `WebSite` and `WebPage` JSON-LD from known data.
- Convert site-local share-image paths to absolute URLs when possible.
- Add validated, explicit Cloudflare Pages `_headers` rules.
- Keep metadata and header output deterministic and inspectable.
- Prevent attribute and JSON-script injection from build-plan values.
- Document Cloudflare Pages Function limitations clearly.

## Non-goals

- Arbitrary `<head>` HTML.
- Arbitrary user-authored JSON-LD.
- Rich-result-specific schemas such as `Article`, `Product`, `Event`,
  `LocalBusiness`, `Person`, or `Organization`.
- Automatic social-image generation or resizing.
- Sitemap, `robots.txt`, RSS, or Search Console submission.
- Cache-busting or asset fingerprints.
- Cloudflare zone-level Transform Rules, Redirect Rules, or Bulk Redirects.
- Attaching `_headers` rules to Pages Function responses.
- Component-authored response headers in this increment.
- Automatic Content Security Policy generation.

## Build-plan Contract

### Site defaults

Add an optional top-level `head` object:

```yaml
head:
  description: Clodsite turns a reviewable build plan into a deployed website.
  image:
    src: /assets/clodsite-share.png
    alt: Clodsite build-plan workflow
```

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `head.description` | non-empty string | no | Default page description; falls back to `overview` |
| `head.image.src` | non-empty string | yes, when `image` exists | Absolute `https://` URL or site-root path |
| `head.image.alt` | non-empty string | yes, when `image` exists | Accessible description of the share image |

Unknown fields are rejected.

### Page overrides

Each page may add an optional `head` object with the same shape:

```yaml
pages:
  - id: how-it-works
    title: How It Works
    head:
      description: See how Clodsite separates AI-assisted decisions from deterministic compilation.
      image:
        src: /assets/how-clodsite-works.png
        alt: Diagram of the Clodsite workflow
    components:
      - type: prose
        markdown: |
          # Creativity in front. Reliability behind it.
```

Resolution is field-by-field:

1. `pages[].head` value;
2. top-level `head` value;
3. `overview` for description only;
4. absent for image.

A page may override the description without replacing the site image, or
override the image while retaining the site description. There is no `null`
suppression syntax in v1.

### Response headers

Add an optional top-level `headers` array:

```yaml
headers:
  - path: /*
    values:
      X-Content-Type-Options: nosniff
      Referrer-Policy: strict-origin-when-cross-origin
  - path: /assets/*
    values:
      Cache-Control: public, max-age=86400
```

Each rule contains:

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `path` | non-empty string | yes | Root-relative path pattern or absolute `https://` URL |
| `values` | non-empty object | yes | Header-name to single-line string value |

Validation rules:

- At most 100 rules, matching Cloudflare Pages' current limit.
- Duplicate `path` entries are rejected; combine their values into one rule.
- Paths must begin with `/` or `https://`.
- Header names must match HTTP token syntax.
- Header values must be non-empty strings without CR or LF.
- Header names beginning with `!` are rejected; header removal is deferred.
- Every generated line must be no longer than 2,000 characters.
- Unknown fields are rejected.

Clodsite does not generate default security headers. Policies such as CSP,
framing, permissions, caching, and CORS are site decisions and can break valid
features when guessed. The build plan must opt into each header explicitly.

## URL Derivation

When `custom_domain` is non-empty, the canonical origin is:

```text
https://<custom_domain>
```

The home page canonical URL is the origin plus `/`. Other canonical URLs use
their generated permalink.

When `custom_domain` is empty:

- no canonical link is emitted;
- `og:url` is omitted;
- generic JSON-LD is omitted because Clodsite does not know the actual Pages
  production subdomain at build time;
- an absolute external share-image URL remains usable;
- a site-root share-image path is omitted from social metadata with a build
  warning because it cannot be made absolute reliably.

Clodsite deliberately does not assume `<slug>.pages.dev`; Cloudflare can assign
a suffixed production subdomain when a project name is unavailable.

## Generated `<head>` Output

Every page emits:

```html
<title>How It Works | Clodsite</title>
<meta name="description" content="...">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Clodsite">
<meta property="og:title" content="How It Works | Clodsite">
<meta property="og:description" content="...">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="How It Works | Clodsite">
<meta name="twitter:description" content="...">
```

When a canonical origin is known:

```html
<link rel="canonical" href="https://clodsite.com/how-it-works/">
<meta property="og:url" content="https://clodsite.com/how-it-works/">
```

When an absolute share image is available:

```html
<meta property="og:image" content="https://clodsite.com/assets/share.png">
<meta property="og:image:alt" content="Clodsite workflow">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://clodsite.com/assets/share.png">
<meta name="twitter:image:alt" content="Clodsite workflow">
```

`twitter:card` is `summary_large_image` when an image is emitted and `summary`
otherwise. There is no provider-specific account or handle field in v1.

All attribute values are escaped in Nunjucks.

## Structured Data

When a canonical origin exists, each page emits one JSON-LD script containing
an `@graph` with:

- one `WebSite` node identified by `<origin>/#website`; and
- one `WebPage` node identified by `<canonical-url>#webpage`.

The page references the site through `isPartOf`. Name, URL, description, and
optional image data are derived from the same resolved metadata used by the
HTML tags. Clodsite does not ask the plan author to duplicate those values.

The JSON-LD serializer must escape `<`, U+2028, and U+2029 before embedding JSON
inside a `<script>` element. Raw build-plan text must never be concatenated into
the script.

## Compiler Changes

### Validation

`scripts/validate-plan.sh` gains reusable validators for:

- site and page `head` objects;
- image objects;
- header rule arrays;
- header names, values, paths, duplicate paths, rule count, and line length.

The component-schema validator remains unchanged.

### Page metadata

`scripts/render-templates.sh` resolves each page's metadata and writes a
`pageHead` object into generated front matter. It derives:

- full title;
- description;
- canonical URL;
- Open Graph URL;
- absolute image URL and alt text; and
- JSON-LD data.

`scaffold/src/_includes/base.njk` renders only the resolved object. This keeps
policy and URL construction out of the template.

`scaffold/.eleventy.js` adds a `jsonScript` filter for safe JSON-LD
serialization.

### Response headers

Add `scripts/render-headers.sh`. It reads `build-plan.yaml` and:

- removes a stale `dist/_headers` when no rules are configured;
- writes one Cloudflare Pages block per configured rule;
- preserves plan order; and
- ends the file with a newline.

The script runs after Eleventy, because `build-site.sh` recreates `dist/`.
It is added to:

- `.claude/commands/build.md`;
- `scripts/build-deploy.sh`; and
- `mcp/pipeline.js`.

## Header Composition

Cloudflare applies every matching `_headers` rule. If the same header is
applied by multiple matching rules, Cloudflare joins the values with commas.
Clodsite preserves this platform behavior rather than attempting to infer path
overlap.

Within a single rule, each header name may appear once. Across different rules,
the same name is allowed and its additive effect is documented.

Components do not contribute `_headers` entries in v1:

- no current static component requires a response header;
- Pages Functions ignore `_headers` and must set their own response headers;
- security headers, especially CSP, are not safely composable from arbitrary
  component fragments.

If a future component has a concrete static-header requirement, component
contributions will receive a separate design with conflict rules grounded in
that real use case. This increment keeps ownership explicit in the top-level
build plan.

## Error and Warning Behavior

Validation errors stop the build for malformed metadata or headers.

`render-templates.sh` emits a non-fatal warning when a root-relative share
image cannot be made absolute because `custom_domain` is empty. The image still
works as a normal site asset; only social image tags are omitted.

No warning is emitted for:

- an absent `head` block;
- fallback from page description to site description or `overview`; or
- an absent share image.

## Compatibility

All new fields are optional. Existing plans continue to validate and build.
Their pages gain description and social title tags using `overview`, but they
do not gain canonical URLs, JSON-LD, share images, or `_headers` unless the
necessary inputs are present.

## Files Changed

| File | Action |
|---|---|
| `scripts/validate-plan.sh` | Validate `head`, page overrides, and `headers` |
| `scripts/render-templates.sh` | Resolve page metadata into front matter |
| `scripts/render-headers.sh` | New deterministic `_headers` renderer |
| `scripts/build-deploy.sh` | Run header rendering after Eleventy |
| `scaffold/.eleventy.js` | Add safe JSON-script serialization filter |
| `scaffold/src/_includes/base.njk` | Render metadata and JSON-LD |
| `.claude/commands/build.md` | Add header-render step |
| `.claude/commands/plan.md` | Document optional metadata and headers |
| `mcp/pipeline.js` | Add header-render step and field reference |
| `mcp/pipeline.test.js` | Verify pipeline ordering/reference output |
| `scripts/test/fixtures/valid-build-plan-metadata.yaml` | Valid feature fixture |
| `scripts/test/run-tests.sh` | Validation, rendering, build, and stale-file tests |
| `README.md` | Document metadata and response-header capability |
| `CLAUDE.md` | Update build-plan and pipeline documentation |
| `ROADMAP.md` | Mark the item complete after implementation |

## Verification

- Full shell test suite passes.
- MCP tests pass.
- A fixture build contains escaped description, canonical, Open Graph,
  Twitter Card, and JSON-LD output.
- Root-relative images become absolute with `custom_domain`.
- Missing `custom_domain` omits unresolved absolute metadata and warns.
- `dist/_headers` exactly matches configured rules.
- Removing `headers` from a plan removes stale `dist/_headers`.
- A production smoke test confirms metadata in HTML and configured response
  headers on a deployed static page.

## Sources

- Cloudflare Pages custom headers:
  <https://developers.cloudflare.com/pages/configuration/headers/>
- Open Graph protocol:
  <https://ogp.me/>
- Google structured-data introduction:
  <https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data>
