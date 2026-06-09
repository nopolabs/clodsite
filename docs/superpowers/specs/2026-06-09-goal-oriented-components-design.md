# Goal-Oriented Informational Components — Design

**Date:** 2026-06-09
**Status:** Implemented (deployment pending)
**Related roadmap entry:** "Goal-oriented informational components"
**Product test:** `demo.clodsite.com`

---

## Background

Clodsite's current component catalog can express prose, galleries, one
image-and-prose relationship, and contact forms. Those are useful content and
layout primitives, but they do not directly express the communication goals
that recur across targeted informational websites:

- establish the page's main message;
- explain benefits or capabilities;
- make important facts easy to scan;
- add social proof or a memorable quotation;
- direct the visitor toward a next action; and
- present projects, services, or useful resources as actionable choices.

Authors can approximate these patterns with Markdown, but the result has weak
visual hierarchy and no constrained vocabulary for actions, cards, facts, or
testimonials. Adding a general grid, arbitrary columns, style controls, or raw
HTML would solve the wrong problem. Clodsite should add components named for
what a section is trying to accomplish.

## Goals

- Add a small, reusable set of goal-oriented informational components.
- Give each component a semantic, accessible HTML structure.
- Provide useful visual hierarchy across all three existing themes.
- Keep layout, spacing, breakpoints, and presentation out of
  `build-plan.yaml`.
- Make actions explicit and bounded without adding a standalone button
  component.
- Keep component schemas strict enough for reliable agent generation.
- Create a permanent public lookbook at `demo.clodsite.com`.
- Use the lookbook as the acceptance test for every visual theme.

## Non-goals

- General grids, rows, columns, spans, containers, or nested components.
- Per-component colors, font sizes, spacing, borders, shadows, or CSS classes.
- Per-page theme selection.
- Arbitrary visitor-defined themes or colors.
- Arbitrary icons, icon libraries, or emoji-as-icon configuration.
- Carousels, accordions, tabs, modals, animation controls, or client-side state.
- Pricing tables, team directories, timelines, FAQ accordions, or logos.
- A standalone `button` component.
- A generic card component with arbitrary fields.
- Replacing `prose`, `media-section`, or `gallery`.
- Making operational form components part of the public demo's live workflow.

## Component Set

The first goal-oriented catalog slice adds six components:

| Component | Communication goal |
|---|---|
| `hero` | Establish the page's primary message and first actions |
| `feature-grid` | Explain features, benefits, principles, or capabilities |
| `key-facts` | Make a small set of important values or facts scannable |
| `quote` | Add a testimonial, endorsement, or attributed quotation |
| `resource-cards` | Present actionable projects, services, or resources |
| `call-to-action` | End or interrupt a page with one focused next step |

Buttons are represented by a shared action shape inside `hero` and
`call-to-action`. This keeps every button attached to a communication goal and
prevents arbitrary button placement.

## Shared Action Shape

```yaml
actions:
  - label: Explore the catalog
    href: /components/
    style: primary
  - label: View on GitHub
    href: https://github.com/nopolabs/clodsite
    style: secondary
```

| Field | Type | Rules |
|---|---|---|
| `label` | non-empty string | Required |
| `href` | non-empty href string | Required; root-relative, fragment, `https://`, or `mailto:` |
| `style` | enum | Optional; `primary` or `secondary`, default `primary` |

Action arrays contain one or two items. Components render actions in plan
order. They do not accept target, rel, size, color, alignment, icon, or
JavaScript behavior.

## Component Contracts

### `hero`

```yaml
- type: hero
  eyebrow: Component lookbook
  heading: Build around the message, not the grid
  markdown: |
    Goal-oriented components give Clodsite sites stronger hierarchy while
    keeping the build plan constrained and reviewable.
  actions:
    - { label: See the components, href: /components/, style: primary }
  image:
    src: /assets/hero.jpg
    alt: A collection of Clodsite component specimens
  image_position: right
```

Required:

- `heading`: non-empty string
- `markdown`: non-empty string rendered as GFM

Optional:

- `eyebrow`: non-empty string
- `actions`: one or two action objects
- `image`: `{ src, alt }`, both non-empty strings
- `image_position`: `left` or `right`, default `right`

Behavior:

- Without an image, the hero is a strong text-first opening.
- With an image, it becomes a two-column section on wide screens.
- On narrow screens, text always precedes the image so the primary message and
  actions appear first.
- `image_position` affects wide-screen placement only.
- The hero heading renders as `<h1>`.
- A page may contain at most one `hero`, and it must be the page's first
  component.

The hero does not expose centered/split widths, image ratios, height, overlay,
background image, alignment, or heading level.

### `feature-grid`

```yaml
- type: feature-grid
  heading: Why this approach works
  intro: A small set of benefits, explained clearly.
  items:
    - title: Reviewable
      text: The complete site contract is ordinary YAML.
    - title: Deterministic
      text: Valid plans compile without another inference step.
    - title: Portable
      text: Different agents can meet at the same build boundary.
```

Required:

- `items`: two to six objects
- each item: non-empty `title` and `text`

Optional:

- `heading`: non-empty string
- `intro`: non-empty string

The component chooses its responsive column count. There are no icons,
per-item links, images, featured items, or column controls.

### `key-facts`

```yaml
- type: key-facts
  heading: At a glance
  items:
    - value: "3"
      label: Visual styles
      detail: Minimal, professional, and bold
    - value: "100%"
      label: Scripted after approval
```

Required:

- `items`: two to six objects
- each item: non-empty `value` and `label`

Optional:

- `heading`: non-empty string
- item `detail`: non-empty string

The component renders a semantic `<dl>`. Values are strings because facts may
be numbers, percentages, dates, durations, or short phrases. Authors do not
choose typography, units, columns, or emphasis.

### `quote`

```yaml
- type: quote
  quote: The build plan is where creative exploration becomes a reliable contract.
  attribution:
    name: Clodsite design principle
    role: Project documentation
  image:
    src: /assets/portrait.jpg
    alt: Portrait of the person quoted
```

Required:

- `quote`: non-empty plain-text string
- `attribution.name`: non-empty string

Optional:

- `attribution.role`: non-empty string
- `image`: `{ src, alt }`, both non-empty strings

The component renders `<blockquote>`, `<footer>`, and `<cite>`. The image is a
small optional attribution image, not a general layout image. The component
does not support ratings, company logos, multiple quotes, quotation-mark
controls, or arbitrary Markdown in the quotation.

### `resource-cards`

```yaml
- type: resource-cards
  heading: Keep exploring
  intro: Projects and references that continue the story.
  items:
    - title: Clodsite on GitHub
      description: Source, design documents, and the component catalog.
      href: https://github.com/nopolabs/clodsite
      link_label: View the repository
      image:
        src: /assets/github-card.jpg
        alt: Clodsite source repository
```

Required:

- `items`: one to six objects
- each item: non-empty `title`, `description`, and safe `href`

Optional:

- `heading`: non-empty string
- `intro`: non-empty string
- item `link_label`: non-empty string, default `Learn more`
- item `image`: `{ src, alt }`, both non-empty strings

Every card is actionable. This is not a generic card layout for arbitrary
content. The component chooses columns and image treatment. Authors cannot
feature a card, reorder fields, select aspect ratios, or add custom badges.

### `call-to-action`

```yaml
- type: call-to-action
  heading: Ready to describe your site?
  markdown: |
    Start with your goals and source material. Clodsite will help turn them
    into a reviewable plan.
  emphasis: strong
  actions:
    - { label: Read the workflow, href: /how-it-works/, style: primary }
    - { label: View the source, href: https://github.com/nopolabs/clodsite, style: secondary }
```

Required:

- `heading`: non-empty string
- `markdown`: non-empty string rendered as GFM
- `actions`: one or two action objects

Optional:

- `emphasis`: `strong` or `subtle`, default `strong`

`strong` uses the theme's accent treatment. `subtle` uses its surface
treatment. Authors do not choose colors, alignment, widths, or backgrounds.

## Schema Enhancements

The existing recursive descriptor format needs two bounded additions.

### Array maximum

Add `max_items` for `type: "array"` descriptors:

```json
{
  "type": "array",
  "min_items": 1,
  "max_items": 2,
  "items": {}
}
```

`max_items` must be a non-negative integer and cannot be smaller than
`min_items`.

### Safe href format

Add `format: "href"` for string descriptors:

```json
{ "type": "string", "non_empty": true, "format": "href" }
```

Accepted values:

- site-root paths beginning with one `/`, such as `/components/`;
- page fragments beginning with `#`;
- absolute `https://` URLs with a hostname; and
- `mailto:` URLs with a non-empty address.

Protocol-relative URLs, relative paths, `http://`, `javascript:`, `data:`, and
control characters are rejected.

## Catalog Documentation

`generate-catalog-md.sh` currently documents an array but not fields inside its
object items. It will recurse through array item descriptors and emit paths
such as:

```text
items[] (object)
items[].title (non-empty string)
items[].description (non-empty string)
```

It will also include `min_items`, `max_items`, and `format` information in
field descriptions. This gives agents enough information to construct valid
component objects without opening raw schema files.

## Markup and Accessibility

All templates must:

- use a root class matching `c-<component-name>`;
- explicitly escape every build-plan string because Nunjucks autoescape is
  disabled;
- use semantic section, heading, list, definition-list, article, blockquote,
  figure, and link elements where appropriate;
- preserve action order and visible keyboard focus;
- render meaningful image `alt` text;
- omit absent optional wrappers rather than rendering empty markup; and
- remain coherent without CSS or JavaScript.

No new component requires JavaScript.

## Theme Contract

Goal-oriented components need a small semantic token layer shared by all three
themes. Each theme will define:

```css
--color-muted;
--color-border;
--color-on-accent;
--color-surface-raised;
--shadow-card;
```

Existing tokens remain:

```css
--color-bg;
--color-text;
--color-accent;
--color-surface;
--font-heading;
--font-body;
--spacing-section;
--border-radius;
```

Components consume tokens but do not branch on theme names. Theme personality
comes from token values and inherited typography:

- **minimal:** quiet borders, little or no shadow, restrained surfaces;
- **professional:** layered surfaces, moderate radius, conservative shadow;
- **bold:** dark raised surfaces, sharp corners, high-contrast accent.

The component contract does not expose tokens to the build plan.

## Optional Live Theme Selector

Add an optional site-level theme selector:

```yaml
style: bold
theme_selector:
  enabled: true
  options: [minimal, professional, bold]
```

`style` remains the default and no-JavaScript theme. `theme_selector` is
site-wide presentation configuration, not a page component.

### Validation

When `theme_selector` is present:

- it must be an object containing exactly `enabled` and `options`;
- `enabled` must be boolean;
- `options` must be an array of unique built-in theme names;
- every option must be one of `minimal`, `professional`, or `bold`;
- when enabled, it must contain at least two options;
- when enabled, it must include the site's default `style`;
- when disabled, `options` may be empty and no selector is rendered.

Clodsite does not accept custom labels, stylesheet URLs, colors, ordering
metadata, or per-page overrides.

### Runtime behavior

When enabled:

- an accessible labeled `<select>` appears at the end of the site navigation;
- the selected option swaps the active `/css/themes/<theme>.css` stylesheet;
- the body class changes from `theme-<old>` to `theme-<new>`;
- the visitor's choice is persisted in `localStorage`;
- `?theme=<name>` selects a valid configured theme and takes precedence over
  stored preference;
- a valid query selection is also persisted, so navigation remains in the
  chosen theme after the query string is no longer present;
- changing the selector updates the current URL through
  `history.replaceState`, creating a shareable theme-preview URL without
  reloading;
- invalid query or stored values fall back to `style`; and
- storage or History API failures are non-fatal.

The theme stylesheet is switched synchronously in `<head>` before body content
is parsed to minimize a flash of the default theme. The body class is corrected
immediately after `<body>` opens.

When JavaScript is unavailable, the default `style` stylesheet remains active,
the selector remains hidden through its HTML `hidden` attribute, and the
complete site remains usable. JavaScript removes `hidden` only after successful
initialization.

### Fonts

Ordinary fixed-theme sites continue loading only their selected theme's font
families. A site with an enabled selector loads the font families required by
all configured options so switching does not produce missing or fallback
typography.

### Scope

The selector is reusable but intentionally narrow:

- it changes the whole site's visual theme;
- it never changes content, metadata, component configuration, or URLs;
- it supports only built-in themes included in the approved option list; and
- ordinary customer sites remain fixed-theme unless they opt in.

## `demo.clodsite.com` Lookbook

Create one canonical Clodsite site:

```yaml
slug: clodsite-demo
name: Clodsite Component Lookbook
style: bold
theme_selector:
  enabled: true
  options: [minimal, professional, bold]
custom_domain: demo.clodsite.com
```

Proposed pages:

| Page | Purpose |
|---|---|
| Home | Introduce the lookbook using a real `hero`, `feature-grid`, and CTA |
| Heroes & Actions | Show hero variants and strong/subtle calls to action |
| Features & Facts | Show feature grids and key facts with realistic copy |
| Quotes & Resources | Show quotations and actionable resource/project cards |
| Themes | Explain the three themes and invite live comparison with the selector |

The demo uses realistic informational-site copy rather than placeholder lorem
ipsum. Each specimen is followed by a compact `prose` block showing its
`build-plan.yaml` fragment.

The public demo showcases all presentation components, including existing
`prose`, `media-section`, and `gallery`. Operational components
(`mailto-form`, `resend-form`) are documented and linked from the lookbook but
are not active examples, avoiding accidental email side effects and provider
configuration in a design catalog.

### Live theme comparison

Clodsite's authored default remains one theme per site. The lookbook opts into
the reusable live selector so visitors can render the same real components
under minimal, professional, and bold CSS.

The Themes page explains each theme's typography, color, spacing, and suitable
use cases. Visitors use the persistent header selector to compare the entire
site in place. Links such as:

```text
https://demo.clodsite.com/themes/?theme=minimal
```

provide shareable previews. No screenshots, duplicate sites, per-page theme
fields, or demo-only CSS are required.

## Product-Test Acceptance Criteria

- Every new component appears at least once on `demo.clodsite.com`.
- Every component includes a visible corresponding YAML example.
- Existing presentation components are represented.
- All three themes can be selected live on every page.
- Query-string selection, persistence, and invalid-value fallback work.
- The default bold site remains complete and usable without JavaScript.
- The demo works at narrow mobile widths without horizontal overflow.
- Links and action styles have visible focus states.
- Metadata, JSON-LD, and conservative response headers are configured.
- The demo builds and deploys through the ordinary Clodsite pipeline.
- No demo-only rendering code enters the product compiler.

## Files Changed

Product repository:

- `components/hero/{schema.json,component.njk,component.css}`
- `components/feature-grid/{schema.json,component.njk,component.css}`
- `components/key-facts/{schema.json,component.njk,component.css}`
- `components/quote/{schema.json,component.njk,component.css}`
- `components/resource-cards/{schema.json,component.njk,component.css}`
- `components/call-to-action/{schema.json,component.njk,component.css}`
- `components/CATALOG.md`
- `scripts/validate-plan.sh`
- `scripts/generate-catalog-md.sh`
- `scripts/write-site-json.sh`
- `scripts/test/run-tests.sh`
- `scaffold/src/_includes/base.njk`
- theme CSS files
- `README.md`
- `CLAUDE.md`
- `ROADMAP.md`
- this design and its implementation plan

Sites repository:

- `clodsite-demo/build-plan.yaml`
- `clodsite-demo/assets/`
- generated `clodsite-demo/dist/`

## Risks and Mitigations

### Catalog growth

Six additions bring the catalog to eleven components, still below the
component-catalog design's approximate threshold for considering per-page CSS
bundling. The bundle remains simple and deterministic.

### Components look too similar

Each component has a distinct semantic job and DOM structure. Theme tokens
create visual coherence without collapsing everything into generic cards.
The lookbook is the review surface for spotting accidental sameness.

### Build plans become presentation-heavy

Schemas expose content, action priority, optional images, and only two
high-level emphasis choices. They do not expose dimensions or CSS decisions.

### Theme switching flashes or loads excess fonts

The active theme link is changed synchronously in the document head, before
body parsing. Loading multiple font families is limited to explicitly enabled
selector sites; ordinary fixed-theme sites keep the current one-theme cost.

### Demo becomes special infrastructure

The demo is an ordinary Clodsite site using a reusable opt-in feature. There is
no demo-only compiler branch, duplicate site, or screenshot pipeline.

## Sources

- Existing component catalog design:
  `docs/superpowers/specs/2026-05-31-component-catalog-design.md`
- Existing constrained media component:
  `docs/superpowers/specs/2026-06-07-media-section-component-design.md`
