# Phase-0 pilot — run 2 (post-fix) — 2026-06-16

Re-run after fixing F1–F7, to check whether the fixes worked — especially F5 (the
authoring guide) and F2 (the redesigned extensibility probe). N = 1 per arm,
scenarios 1, 2, 3, 4, 6, 7a, 7b, 8 (checkout deferred). Pro plan, one subagent per
arm. Still coarse/directional — not headline numbers.

## Coarse run stats

| | Clodsite | Control | vs run 1 |
|---|---|---|---|
| Subagent tokens (full arc) | ~74,200 | ~46,200 | Clodsite 92k→74k; control 34k→46k |
| Build failures | 0 | 1 (harness: missing `node_modules`) | — |
| Determinism (scenario 8) | identical ✓ | identical ✓ | both still pass |

Token gap narrowed from **2.7× (run 1) to 1.6× (run 2)** — partly F5 (less
engine-source reading), partly because the redesigned 7b now makes the control do
real work too (a JS calculator instead of a free native `<details>`).

## Review-diff per scenario (containment metric)

Source lines changed (Clodsite: `build-plan.yaml` + `commerce/` + `assets/`, plus
new component source for 7b; control: everything under `src/`).

| Scenario | Clodsite | Control | Notes |
|---|---|---|---|
| 01 create | 166 | 1799 | control front-loads content + CSS |
| 02 reposition | 29 | 67 | |
| 03 add page | 52 | 26 | markdown terser for a plain text page |
| 04 catalog | 70 | 81 | |
| **06 reskin** | **2** | **155** | `style: minimal→bold` vs a CSS overhaul |
| 07a testimonials + CTA | 21 | 57 | |
| **07b calculator (extensibility)** | **179** (9 plan + 170 component) | **112** | the redesign working — see below |

**Revision median (2, 3, 6, 7a): Clodsite ~25 vs control ~62** — Clodsite's
reviewable surface is ~2.5× smaller on edits, dominated by the reskin (2 vs 155).
**Create:** 166 vs 1799. Simple text edits (add-page) still slightly favor the
control's Markdown.

## Did the two key fixes work?

**F2 (redesign 7b) — yes, decisively.** Both arms now do real work, and the
extensibility cost is finally visible: the Clodsite arm had to **author a typed
component** (`brew-calculator`: schema + njk + css + inline script, ~170 lines,
+ CATALOG regen, + an engine commit) while the control inlined a one-off widget
(~112 lines). On a *single* use Clodsite's review-diff is **larger** (179 vs 112)
— the honest cost of a reusable, validated component vs. inline code. The
amortization counter-point is real (170 lines once, then 9 lines per reuse) but
unmeasured here. Either way, 7b now measures the thing it's named for. The old
FAQ probe (both arms used native `<details>`, ~free) measured nothing.

**F5 (authoring guide) — partial.** Clodsite tokens dropped 92k→74k and the guide
covered the non-obvious behaviors (reskin=`style`, display-only catalog, asset
locations) accurately. But the agent **still read engine source twice**, for two
things the guide names but doesn't specify:

- **G1 — `commerce/catalog.json` field list.** The guide says "provide
  catalog.json" + "prices are minor units" but lists no fields; the agent read
  `validate-catalog.mjs` to learn the required keys. *Add a minimal catalog.json
  example to the guide.*
- **G2 — component `schema.json` descriptor grammar + script convention.** The
  guide says "create schema.json … may include a script" but documents neither the
  descriptor vocabulary (`non_empty`, `enum`, `min_items`, `format: href`, …) nor
  the inline-`<script>`/`document.currentScript` convention; the agent read
  `validate-plan.mjs` and existing components. *Document both in the guide.*

Closing G1/G2 should recover more of the remaining token gap — the confounder is
shrinking but not gone.

## New bug found

**G3 — `generate-catalog-md.sh` prints to stdout; it does not write
`CATALOG.md`.** Running it as the guide documents leaves the file unchanged; the
agent had to redirect output manually. Either fix the wrapper to write the file,
or fix the guide's "regenerate the catalog" step to redirect. (Harmless to the
build — `validate-plan` reads each `schema.json` directly — but the documented
step is wrong.)

## Harness note (orchestration, not protocol)

**H1 — the control arm's `node_modules` wasn't installed** (operator setup error:
a `cd` persisted and ran `npm install` in the wrong workspace twice). Both runs
have now hit a missing-`node_modules` stumble from *setup*, not the product. The
protocol's setup step must install **and verify** deps in *both* workspaces before
launching either arm.

## F7 in action

The interaction check earned its keep: the control **pre-rendered** `31 g / 500 ml`
into static HTML, but the Clodsite component **computes the default via JS**, so
`31` is absent from the static markup and appears only after the script runs. The
calculator's correctness therefore **cannot be confirmed statically** — only the
formula is visible (`ratio 16`, `water = cups×250`, `coffee = water/16`). This
round had no headless driver wired, so the live recompute is **verified by code
inspection only**; a real run needs the headless check the rubric now specifies.

## Determinism

Both arms: building twice from unchanged final source → byte-identical output. ✓

## Net

The fixes moved the needle: 7b now measures extensibility (and shows the typed-
component cost the old probe hid); F5 cut the learning confounder ~20% with two
concrete gaps (G1, G2) left to close; both arms deterministic. New: one real bug
(G3), one setup-robustness fix (H1). The two-sided headline sharpened — **strong
containment win on edits (reskin 2 vs 155; revision median 25 vs 62), a real and
now-visible extensibility cost on 7b, and a narrowing token gap.** Still $0.
