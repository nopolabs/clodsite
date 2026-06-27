# Theme System — Working Notes

> Living notes (not a spec). Captures what we're learning about Clodsite's theme
> system as we push on ROADMAP #18 (raise the theme ceiling). Started 2026-06-16
> from the Phase-0 benchmark finding that an unconstrained control arm produced a
> visibly nicer site than Clodsite's fixed themes.
>
> **These notes are now synthesized into a proposed spec:**
> `docs/superpowers/specs/2026-06-27-theme-ceiling-brand-tokens-design.md`
> (personality × curated palette × bounded brand tokens, + finer tokens +
> component polish). Keep appending evidence here; design decisions live there.

## How themes work today

- A theme is **one file**: `scaffold/src/css/themes/<style>.css`.
- It sets **CSS variables** (`--color-*`, `--font-heading`/`--font-body`,
  `--font-size-base`, `--spacing-section`, `--border-radius`, `--shadow-card`),
  base element typography, and the **site chrome** (`.site-header`, `.site-nav`,
  `.site-name`, `.nav-links`, `.site-footer`, `.site-main`, component spacing).
- **Components re-skin themselves through the variables** — each
  `components/<name>/component.css` reads `--color-accent` etc., so a theme
  recolors/retypes the whole catalog without touching component code.
- `style` is chosen in `build-plan.yaml` and validated against an enum
  (`validate-plan.mjs` → `validStyles`). Fonts are loaded per-theme via a
  `<link>` block in `scaffold/src/_includes/base.njk`. Built-ins today:
  `minimal`, `professional`, `bold`.

## Experiment: porting the control's look into a `warm` theme (2026-06-16)

We took the control arm's bespoke "warm editorial coffee" CSS and turned it into
a built-in theme (`warm`: Fraunces display serif, cream/terracotta palette, a
top accent bar, an h2 accent-underline), then rebuilt the actual benchmark site
with `style: warm`.

**What it took:** one theme file + 3 small wiring edits (the `validStyles` enum,
a Fraunces `<link>` block, the apply-theme error message). **No per-site CSS, no
escape hatch.** Clean build; every component recolored itself automatically.

**Result:** ~85% of the control's "nicer" feel is **theme-level** and ported
cleanly. Encouraging — Clodsite *can* clear a much higher visual bar by curating
themes, fully within the small-core principle.

### What carried vs. what didn't

| Carried (theme-level) | Did **not** carry |
|---|---|
| Palette (cream/terracotta/ink) | Pill buttons (999px) *and* 10px cards at once — one `--border-radius` can't do both |
| Display serif (Fraunces) + type scale | The elevated "hero panel," product-card hover-lift, testimonial cards — these are *component-level* layout, not theme-expressible |
| Top accent bar, h2 accent-underline | Per-component bespoke structure generally |
| Header / nav / footer chrome | |

**Takeaway:** a curated theme closes most of the gap; the last slice needs either
**richer components** or **more theme tokens** (below).

## Gaps in the theme contract (evidence for #18)

1. **Token granularity is too coarse.** A single `--border-radius` conflates
   button vs. card vs. input rounding. Candidate additions: `--button-radius`,
   `--card-radius`, maybe `--control-radius`. Same likely true for shadow
   (`--shadow-card` vs. a button/hover shadow) and density/spacing.
2. **Component layout is not theme-expressible.** A theme recolors components but
   can't restructure them (e.g. give product cards a hover-lift, make the hero a
   bordered panel). That's by design (components own layout) — but it caps how
   "designed" a theme can feel. Options: add tasteful structure to the components
   themselves (benefits every theme), or a small set of component-level theme
   hooks.

## Emerging direction: personality × palette (the orthogonal axes)

**Insight (2026-06-16):** a theme fuses two independent things —
**personality** (typography, structure, chrome, signature flourishes) and
**palette** (color). Decouple them: keep the personality fixed and let the
**palette be selectable**. A few themes × a few palettes each = a large visual
range for almost no surface area, still with zero per-site CSS.

Concretely (the originating idea):

- `warm` → default **brown/terracotta**, alternates **blue**, **green**.
- `bold` → default **red**, alternates **green**, **yellow**, **blue**.
- (and so on per theme — each theme ships a default palette + a curated set.)

A **palette is just the color variables** (`--color-accent` and its derived
shades; possibly `--color-bg`/`--color-surface`/`--color-ink` for themes whose
identity is tied to a paper tone). The non-color tokens (fonts, radius, spacing,
chrome structure, the h2 underline) stay constant across a theme's palettes.

### Sketch of how it could work (options, undecided)

- **Authoring:** `build-plan.yaml` gains an optional `palette:` alongside `style:`
  (e.g. `style: warm` + `palette: forest`), defaulting to the theme's default
  palette. Validated against that theme's declared palette set.
- **Mechanics (pick one):**
  - *Separate palette files* layered after the theme: link
    `themes/warm.css` then `themes/palettes/warm-forest.css`.
  - *One theme file, palettes as selectors*: `[data-palette="forest"] { --color-accent: …; }`, with the attribute set on `<body>`.
  - *Plan-injected variables*: the build writes the chosen palette's variables
    into the page (least files, but moves color into generated output).
- **Theme selector** (the existing live-preview opt-in) could extend to palettes
  too — preview `warm/forest` vs `warm/brown` live.

### Open questions

- Which color variables belong to a "palette" vs. stay theme-fixed? (Accent is
  clearly palette; is the paper/background tone part of the palette or the
  personality? For `warm`, the cream tone *is* its identity — so maybe palette =
  accent + a small set of harmonized neutrals, curated per theme, not free
  color-picking.)
- Curated palettes only (named, designed) vs. arbitrary hex? Strong lean toward
  **curated** — arbitrary color is how sites end up ugly; the whole point is that
  Clodsite picks good combinations. (This mirrors the "no raw escape hatch"
  principle, applied to color.)
- How many palettes per theme before it's noise? Probably 3–5, each genuinely
  distinct and tested.
- Do palettes need per-palette font tweaks, or is font strictly personality?
  (Lean: font is personality.)

## Principles this is converging on

- **Curated, not configurable.** Raise the ceiling with designed themes +
  designed palettes, not arbitrary CSS or arbitrary color. Same philosophy as the
  component catalog: constrained vocabulary, good defaults, no foot-guns.
- **Orthogonal axes.** Personality (type/structure) and palette (color) vary
  independently; that multiplies range cheaply.
- **Components carry shared polish.** Flourishes added to components (tasteful
  hover, elevation) benefit every theme at once — better leverage than per-theme
  CSS.

## Next steps / candidates

1. Land the `warm` theme (theme #4) as the first evidence point.
2. Prototype **palette selection** on one theme (likely `warm`: brown / blue /
   green) to validate the personality×palette split end to end.
3. Add finer **theme tokens** (`--button-radius` at least) and re-test the warm
   port to see how much more of the control's look it recovers.
4. Feed results into **benchmark 2** (polish): does `style + palette` let
   Clodsite clear a brand-specific visual bar, and at what cost vs. the control?

Cross-refs: ROADMAP #18 (theme ceiling), `benchmarks/runs/2026-06-16/findings.md`
(the originating finding), `docs/authoring-build-plan.md` (reskin = change
`style`).
