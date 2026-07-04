---
type: Guide
title: Themes
description: The theme contract and theme-authoring notes — what a theme CSS file must contain.
tags: [themes]
timestamp: 2026-06-17T00:00:00Z
---

# Themes

A theme is just a CSS file in `scaffold/src/css/themes/`. The file name is the theme name: `scaffold/src/css/themes/bold.css` is selected by `style: bold` in a site's `build-plan.yaml`.

## What a theme file must contain

### 1. The theme variable contract

Every theme defines the same set of CSS custom properties on `:root`. Components reference **only** these variables — they carry no hardcoded colors of their own — so a theme that defines all of them restyles every component automatically.

| Variable | Purpose |
|----------|---------|
| `--color-bg` | Page background |
| `--color-text` | Body text |
| `--color-accent` | Links, buttons, highlights |
| `--color-on-accent` | Text placed on accent-colored surfaces |
| `--color-surface` | Subtle background panels (header, footer) |
| `--color-surface-raised` | Cards and raised panels |
| `--color-muted` | Secondary text (captions, intros) |
| `--color-border` | Borders and dividers |
| `--color-error` | Form validation and error text |
| `--shadow-card` | Card shadow (can be soft, hard, or none) |
| `--font-heading` | Heading font stack |
| `--font-body` | Body font stack |
| `--font-size-base` | Base font size |
| `--spacing-section` | Vertical rhythm between sections |
| `--border-radius` | Corner rounding (0 for square, larger for soft) |

### 2. Base element and site chrome styles

Beyond the variables, each theme styles the shared page skeleton directly:

- Reset (`box-sizing`, margin/padding zeroing)
- `body`, headings, paragraphs, links
- Site chrome: `.site-header`, `.site-nav`, `.site-name`, `.nav-links`, `.theme-selector`, `.site-main`, `.site-footer`, `section`
- A `@media (max-width: 48rem)` block for mobile layout

This is where a theme's personality beyond color lives — e.g. `bold` uppercases headings and gives the header a thick accent border.

### 3. Registration

Two scripts hold a hardcoded list of valid theme names. A new theme must be added to both:

- `scripts/lib/validate-plan.mjs` — the `validStyles` array
- `scripts/apply-theme.sh` — the error message listing valid styles

## Existing themes

| Theme | One-liner |
|-------|-----------|
| `minimal` | Clean white, Inter everywhere, blue accent, quiet shadows — gets out of the way. |
| `professional` | Off-white with navy accent, Merriweather serif headings — trustworthy and formal. |
| `bold` | Near-black background, orange accent, uppercase Space Grotesk headings, hard offset shadows — loud on purpose. |
| `warm` | Cream and terracotta, Fraunces display serif, editorial and handmade without going full rustic. |
| `playful` | Sunny cream, rounded Baloo headings, orange/yellow accents, and pill navigation — friendly without becoming chaotic. |
| `playful-shop` | The same rounded family as `playful`, but cooler, cleaner, and more product-card-forward for small storefronts. |
| `terminal` | Dark developer-console energy, IBM Plex Mono throughout, green phosphor accents, and command-line heading markers. |
| `academic` | Warm paper, serif reading typography, burgundy accent, and restrained journal-like structure for long-form informational sites. |

## Theme families

When two related sites need to feel "of a feather" without becoming identical,
prefer a small **theme family** over raw per-site CSS. A family shares
typography, rhythm, and broad interaction language, then varies color,
surfaces, and chrome for the site's job. `playful` and `playful-shop` are the
first example: the main Anchovy site can be sunnier and story/gallery-forward,
while the mug storefront stays in the same brand neighborhood but feels calmer
and more product-focused.

This is an incremental step toward the broader palette/brand-token model in
ROADMAP item 18. Until that model exists, sibling themes are acceptable when
they are reusable outside the original site pair and documented as a deliberate
family rather than as one-off site CSS.

## Theme ideas

Brainstormed, not yet built:

| Idea | Description |
|------|-------------|
| `brutalist` | No rounded corners, system fonts, raw black-on-white with thick borders. Makes a statement. |
| `newspaper` | Strong editorial headline typography, tight leading, horizontal rules for structure. Suits content-heavy sites. |
| `glassmorphism` | Frosted-glass cards, subtle gradients, blur effects. Current SaaS aesthetic. |
| `synthwave` | Dark background, neon pink/cyan accents, grid aesthetic. High personality, narrow audience. |
| `influencers` | Gradient everything, pill buttons, big hero typography, pastel or pink/purple palette. Personal-brand energy. |
| `casual` | Off-white, friendly rounded sans, soft muted colors, comfortable line-height. A cozy blog you actually want to read. |
| `punk` | Black background, one jarring accent (hot pink or yellow), zine-cut aesthetic. The anti-professional. |
| `diy` | Warm cream/textured background, slab serif, earthy colors (terracotta, olive, kraft). Wholesome maker energy. |
| `business` | Navy/charcoal/white, clean geometric sans, structured columns, subtle shadows. Credible and intentionally forgettable. |

Note the deliberate contrasts: `casual` vs `diy` (tone vs texture), `punk` vs `diy` (aggressive handmade vs heartfelt handmade), `brutalist` vs `punk` (cold rawness vs hot rawness).
