# Theme Ceiling: Curated Palettes + Bounded Brand Tokens — Design

**Date:** 2026-06-27
**Status:** Proposed
**Roadmap entry:** Raise the theme ceiling (item 18)
**Builds on:** `docs/theme-system-notes.md` (the personality×palette working notes
and the 2026-06-16 `warm` experiment), `docs/THEMES.md` (the theme variable
contract).

---

## Summary

Clodsite's visual quality is capped by its four fixed themes. A site can pick
`style: minimal|professional|bold|warm` and nothing else — so two real brands on
the same theme look identical, and a brand with a specific identity (mtw4: DM
Sans, a custom palette, an italic hero) cannot be reproduced without the raw CSS
the contract forbids. The `warm` experiment showed a curated theme recovers ~85%
of a bespoke look at zero per-site CSS; this design specs the remaining range.

The lever is **three composing layers, each curated or governed — never raw CSS**:

1. **Personality** (`style`) — the existing themes: typography, structure,
   chrome, signature flourishes. Unchanged authoring surface.
2. **Palette** (`palette`, new) — a **curated, named** color set per theme
   (accent + harmonized neutrals). One theme × several palettes multiplies range
   for near-zero surface area.
3. **Brand tokens** (`brand`, new) — a **bounded, governed** per-site override:
   accent (curated swatch *or* a contrast-gated hex), font pairing (from a
   curated catalog), and density (enum). This is the ROADMAP's "brand tokens in
   the plan… without writing CSS," kept safe by guardrails rather than freedom.

Plus two supporting changes the `warm` port proved necessary: **finer theme
tokens** (split the single `--border-radius`; add shadow granularity) and
**shared component polish** (tasteful structure that benefits every theme).

The governing principle, inherited from the component catalog and the theme
notes, is **curated, not configurable**: raise the ceiling with designed options
and automated quality gates, never with an arbitrary-CSS escape hatch.

## How theming works today (grounding)

- A theme is one file `scaffold/src/css/themes/<style>.css`: a `:root` block of
  **design tokens** (`--color-*`, `--font-heading/-body`, `--font-size-base`,
  `--spacing-section`, `--border-radius`, `--shadow-card`) followed by base
  element styles + site chrome that consume them.
- Components carry **no hardcoded color** — each `component.css` reads the tokens,
  so a theme reskins the whole catalog automatically (`apply-theme.sh` aggregates
  `components/*/component.css` → `components.css`).
- `base.njk` loads `<link id="site-theme" href="/css/themes/<style>.css">`, sets
  `<body class="theme-<style>">`, and emits a **hardcoded per-theme Google Fonts
  `<link>`** block. The optional `theme_selector` swaps the theme href live
  (localStorage + `?theme=` query), for the lookbook.

The token system already exists; this design exposes a governed slice of it and
adds the orthogonal palette axis.

## The reconciliation (curated vs. brand-specific)

The theme notes lean hard toward *curated, not configurable* and warn that
arbitrary color is how sites turn ugly. The ROADMAP simultaneously asks for
*brand tokens in the plan*. These are reconciled by **governing** the brand
layer rather than freeing it — every brand value is either:

- **chosen from a curated set** (palette name, font-pairing name, density enum), or
- **passed through an automated quality gate** (an accent hex must clear a
  contrast threshold against the theme's neutrals, or validation rejects it).

So `brand` is "configurable within a curated frame," not an escape hatch: no raw
CSS, no arbitrary `@font-face`, no low-contrast foot-guns. That distinction is
the whole point and is enforced in `validate-plan`, deterministically.

## Layer 1 — Personality (`style`), unchanged

`style` continues to select a theme. This design adds **more, less-generic
themes** over time (the `docs/THEMES.md` idea list: `editorial`, `terminal`,
`casual`, etc.), but that is incremental curation, not a schema change. A theme
now additionally declares its **palette set** and **default font pairing**
(below).

## Layer 2 — Palette (curated color, selectable)

A **palette** is a curated, named set of the *color* tokens — `--color-accent`
and its derived on-accent/shade tokens, plus (only where a theme's identity is
tied to it) a harmonized neutral set (`--color-bg/-surface/-text`). Non-color
tokens (fonts, radius, spacing, chrome, flourishes) stay **fixed per theme** —
they are personality, not palette.

- **Authoring:** `build-plan.yaml` gains optional `palette: <name>` alongside
  `style:`. Omitted → the theme's default palette.
- **Declaration:** each theme ships its palette set (a default + 2–4 curated
  alternates), each genuinely distinct and tested. e.g. `warm` →
  `terracotta`(default)/`forest`/`indigo`; `bold` → `orange`/`acid`/`electric`.
- **Mechanics (decided):** palettes are `body[data-palette="<name>"] { … }`
  blocks shipped with the theme (a co-located `themes/<style>.palettes.css`);
  `base.njk` sets `<body data-palette="<name>">`. Default palette is the theme's
  base `:root` (attribute absent). This makes the **theme selector** extend to
  palettes by toggling the attribute live — no extra fetch, instant preview —
  and keeps color out of generated per-page output.

Decision on the notes' open question: a palette is **curated accent + harmonized
neutrals, designed per theme — not free color-picking.** Arbitrary hex lives only
in the governed `brand.accent` path (Layer 3), behind the contrast gate.

## Layer 3 — Brand tokens (`brand`, bounded per-site override)

For a real brand that a curated palette can't hit exactly, an optional `brand`
block — every field guard-railed:

```yaml
style: minimal
brand:
  accent: "#ff4500"        # curated swatch name OR a hex that clears the
                           # contrast gate vs. the theme's neutrals
  font_pairing: dm-sans    # a name from the curated font catalog (loads the
                           # right Google Fonts; no arbitrary @font-face)
  density: comfortable     # compact | comfortable | spacious
```

- **`accent`** — a curated swatch name, or a `#rrggbb` hex. A hex is **validated
  for contrast** against the theme's `--color-bg`/`--color-surface` (and
  `--color-on-accent` is auto-derived to a readable black/white); failing
  contrast is a hard validation error naming the measured ratio. Brand accent
  overrides the palette's accent (brand is the site's fixed identity).
- **`font_pairing`** — a name from a **curated catalog** (`scaffold/fonts.json`):
  each entry names the heading + body families and the Google Fonts URL to load.
  e.g. `dm-sans` → DM Sans body + Space Grotesk headings. Overrides the theme's
  default pairing. No raw font URLs or `@font-face`.
- **`density`** — an enum mapping to a curated spacing/line-height/control-padding
  scale (one named token set each), not arbitrary numbers.

**Mechanics:** `apply-theme.sh` resolves the `brand` block into a small generated
`scaffold/src/css/brand.css` (`:root`/`body`-scoped token overrides, emitted to
win over palette + theme by load order/specificity) and resolves the font
families to load. `base.njk`'s hardcoded per-theme font `<link>` blocks are
**replaced by a data-driven emission**: the build computes the active families
(theme default pairing, overridden by `brand.font_pairing`) and emits the one
catalog `<link>`. `brand.css` is linked last. Omitting `brand` → no `brand.css`,
behavior identical to today.

## Supporting change A — Finer theme tokens

The `warm` port found one `--border-radius` conflates button vs. card vs. input
rounding (pill buttons *and* 10px cards are impossible together). Split it, and
add the shadow granularity the same evidence implies:

- `--border-radius` → `--radius-button`, `--radius-card`, `--radius-control`.
- `--shadow-card` keeps its name; add `--shadow-button` for interactive lift.

Pre-1.0, no back-compat: every theme and every `component.css` referencing
`--border-radius`/`--shadow-card` migrates **in the same change** (clean cutover,
per the project's no-shim rule). Density (Layer 3) feeds the spacing side.

## Supporting change B — Shared component polish

A theme recolors components but can't restructure them (no hover-lift, no
bordered hero panel) — that caps how "designed" any theme feels. The leverage
move is to add **tasteful structure to the components themselves** (a measured
card hover/elevation, a hero that can read as a panel), gated by the new tokens
so each theme tunes intensity. This benefits every theme at once and needs no
new authoring surface. Scoped as a parallel workstream, not a schema change;
called out here because the notes identify it as the other half of the ceiling.

## Plan schema (additions)

- `palette` — optional string; must be one of the selected theme's declared
  palettes.
- `brand` — optional object `{ accent?, font_pairing?, density? }`, all optional;
  unknown fields rejected.
- `theme_selector` — gains optional `palettes: [..]` (subset of the theme's
  palettes) to live-preview palette alongside theme; existing `enabled/options`
  unchanged.
- All optional; a plan with none behaves exactly as today.

## Validation (`validate-plan`, structural + deterministic gates)

Secret-free and CI-safe, like the rest of validation:

- `palette` ∈ the theme's declared palette set (else error listing valid names).
- `brand.accent`: a known swatch name, or a syntactically valid `#rrggbb` that
  **clears the WCAG-style contrast threshold** against the theme's neutrals — the
  contrast computation is deterministic, so it runs at validation, not just at
  use; a failure names the ratio and the threshold.
- `brand.font_pairing` ∈ the font catalog; `brand.density` ∈
  `{compact, comfortable, spacious}`.
- `theme_selector.palettes` ⊆ the theme's palettes; when set, the selected
  `palette` (or default) must be included.
- The theme's palette set and default pairing are read from theme metadata
  (a sidecar `themes/<style>.meta.json` or a header block), so validation knows
  what's valid without parsing CSS.

## Theme selector (lookbook) extension

The selector already swaps theme live. It extends to a second control for
**palette** (toggling `data-palette`) when `theme_selector.palettes` is set, so
`clodsite-demo` can demo `style × palette` combinations on one page — the
evidence surface for benchmark 2.

## Evidence: benchmark 2 (polish)

Per the ROADMAP, validate with **benchmark 2**: hold a visual-quality bar
constant and measure each arm's cost to clear it, and specifically whether
`style + palette + brand` lets Clodsite clear a **brand-specific** bar (e.g.
reproduce mtw4's look) at all — and at what cost vs. the unconstrained control.
Design lands first; the benchmark is the proof the ceiling actually moved.

## How the layers compose (precedence)

Lowest → highest: **theme `:root` (default)** → **palette `[data-palette]`** →
**brand override (`brand.css`)**. Fonts: theme default pairing → `brand.font_pairing`.
Density scales spacing/line-height independently of color. Stated as the contract;
the implementation emits `brand.css` last and scopes it to win over palette.

## mtw4 fit (item 15)

mtw4's brand reduces to: `style:` a clean sans personality (existing or a new
`editorial`-ish theme), `brand: { font_pairing: dm-sans, accent: "#…", density:
comfortable }`, and a palette near its colors. The italic hero emphasis is the
one component-level need (constrained inline emphasis in `hero` headings — a
small component tweak, noted in item 15). Long-form **journal typography (item
20)** is a *new theme surface*: index lists, entry headers/dates, post-body
reading rhythm must be part of every theme's contract, not just landing chrome —
so this design and item 20 are sequenced together for the port.

## Deferred (explicit non-goals for v1)

- Arbitrary per-site CSS / `@font-face` / raw color (never — the whole premise).
- Per-component theme overrides in the plan (component polish is shared, not
  per-site configurable).
- Dark-mode auto-switching, per-palette font tweaks (font stays personality),
  and palette *authoring* tools (palettes are curated in-repo).

## Phasing

1. **Finer tokens** (Supporting A) — split radius/shadow, migrate all themes +
   components; re-run the `warm` port to measure recovered fidelity.
2. **Palette axis** (Layer 2) — prototype on one theme (`warm`:
   terracotta/forest/indigo), incl. selector + validation; add palette sets to
   the rest.
3. **Brand tokens** (Layer 3) — font catalog + `brand` block + contrast gate;
   prove against mtw4.
4. **Component polish** (Supporting B) and **benchmark 2** — in parallel; polish
   informs, benchmark scores.

## Testing

- **Validation:** valid `palette`/`brand`/`theme_selector.palettes` pass secret-
  free; reject an unknown palette, a brand accent failing contrast (named ratio),
  an unknown font pairing, a bad density, and selector palettes outside the
  theme's set.
- **Rendering:** `palette` sets `data-palette` and the alternate color tokens
  apply; `brand.accent`/`font_pairing`/`density` emit `brand.css` + the right
  font `<link>` and win over palette/theme; omitting both reproduces today's
  output byte-for-byte (regression guard).
- **Tokens:** components honor `--radius-button` vs `--radius-card`; no stale
  `--border-radius` reference remains (grep gate).
- **Selector:** the lookbook previews `style × palette` live without a reload.
