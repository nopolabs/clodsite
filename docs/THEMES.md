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

- `scripts/validate-plan.sh` — the `validStyles` array
- `scripts/apply-theme.sh` — the error message listing valid styles

## Existing themes

| Theme | One-liner |
|-------|-----------|
| `minimal` | Clean white, Inter everywhere, blue accent, quiet shadows — gets out of the way. |
| `professional` | Off-white with navy accent, Merriweather serif headings — trustworthy and formal. |
| `bold` | Near-black background, orange accent, uppercase Space Grotesk headings, hard offset shadows — loud on purpose. |

## Theme ideas

Brainstormed, not yet built:

| Idea | Description |
|------|-------------|
| `terminal` | Dark background, monospace throughout, green or amber text. Natural fit for developer tools and CLI projects. |
| `brutalist` | No rounded corners, system fonts, raw black-on-white with thick borders. Makes a statement. |
| `academic` | Serif body text, cream background — feels like a printed paper or arXiv preprint. Good for research writing. |
| `newspaper` | Strong editorial headline typography, tight leading, horizontal rules for structure. Suits content-heavy sites. |
| `glassmorphism` | Frosted-glass cards, subtle gradients, blur effects. Current SaaS aesthetic. |
| `synthwave` | Dark background, neon pink/cyan accents, grid aesthetic. High personality, narrow audience. |
| `influencers` | Gradient everything, pill buttons, big hero typography, pastel or pink/purple palette. Personal-brand energy. |
| `casual` | Off-white, friendly rounded sans, soft muted colors, comfortable line-height. A cozy blog you actually want to read. |
| `punk` | Black background, one jarring accent (hot pink or yellow), zine-cut aesthetic. The anti-professional. |
| `diy` | Warm cream/textured background, slab serif, earthy colors (terracotta, olive, kraft). Wholesome maker energy. |
| `business` | Navy/charcoal/white, clean geometric sans, structured columns, subtle shadows. Credible and intentionally forgettable. |

Note the deliberate contrasts: `casual` vs `diy` (tone vs texture), `punk` vs `diy` (aggressive handmade vs heartfelt handmade), `brutalist` vs `punk` (cold rawness vs hot rawness).
