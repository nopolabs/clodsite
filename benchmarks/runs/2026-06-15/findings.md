# Phase-0 pilot findings — 2026-06-15

N = 1 per arm, scenarios 1, 2, 3, 4, 6, 7a, 7b, 8 (checkout #5 deferred). Run on
the Pro plan via one subagent per arm. **These numbers are coarse and
directional — not headline results.** The point of the run was to shake out the
protocol and harness. It did.

## Coarse run stats (subagent tokens — Pro, not per-request)

| | Clodsite | Control |
|---|---|---|
| Subagent tokens (full arc) | ~92,100 | ~34,300 |
| Tool calls | 61 | 37 |
| Duration | ~11.6 min | ~6.0 min |
| Build failures | 1 (harness: missing `node_modules`) | 0 |
| Determinism (scenario 8) | identical ✓ | identical ✓ |

## Review-diff per scenario (the containment metric — from per-scenario commits)

Source lines changed (Clodsite: `build-plan.yaml` + `commerce/` + `assets/`;
control: everything under `src/`; build output gitignored in both).

| Scenario | Clodsite | Control | Notes |
|---|---|---|---|
| 01 create | 182 | 1753 | control front-loads a large first commit (content + CSS) |
| 02 reposition | 33 | 21 | control's markdown is terser than YAML page blocks |
| 03 add page | 58 | 23 | same — simple text page is cheaper in markdown |
| 04 catalog | 86 | 67 | Clodsite incl. generated placeholder SVGs + catalog.json |
| **06 reskin** | **2** | **132** | one line (`style: minimal → bold`) vs a CSS rewrite |
| 07a testimonials + CTA | 24 | 56 | |
| 07b FAQ | 21 | 72 | |

## The two-sided headline

- **Containment (review-diff): Clodsite wins overall**, and *dramatically* on the
  reskin (2 lines vs 132) and create (182 vs 1753). This is the core thesis —
  changes confined to a small reviewable artifact — and it shows. The exception:
  **simple text edits (reposition, add-page) slightly favor the control**, because
  Markdown prose is terser than authoring a page as YAML component blocks.
- **Inference (tokens): the control won this round (~2.7×).** This cuts against
  the thesis at face value, but it is heavily confounded (see Findings F5). The
  honest read: a *cold* first build by an agent that has to read the engine to
  learn the constrained system is the wrong place to look for the token win; the
  thesis predicts it emerges on repeated, cached edits at scale.

Both effects are real and both are worth keeping. The pilot's value is showing
they point in *different directions* — which is exactly why the protocol measures
both.

## Findings / bugs / protocol changes needed

**F1 — Clodsite arm needs `npm install` in the engine worktree.** The only build
failure: scenario-01's first `validate-plan` died on `ERR_MODULE_NOT_FOUND:
js-yaml` because the worktree had no `node_modules`. Add `npm install` to the
Clodsite-arm setup, and put the exact build command sequence in
`instructions/clodsite-arm.md` (it currently references `/build`-style slash
commands a subagent can't use).

**F2 — Scenario 7b does NOT test extensibility (most important fix).** Both arms
implemented the collapsible FAQ with native `<details>`/`<summary>`, zero JS, no
new component. On Clodsite, `prose` passes raw HTML through markdown-it, so the
"unsupported shape" was trivially supported via the built-in escape hatch. 7b
needs a genuinely harder probe — something neither the catalog nor `prose`+HTML
can absorb cleanly (e.g. a filterable/sortable product table, a JS-driven
interactive widget, or an embedded data visualization). As written, 7b measures
nothing the other revision scenarios don't.

**F3 — Asset generation is harness noise.** Clodsite's catalog diff (and create)
is inflated by placeholder SVGs the agent had to invent (hero, founders, 3
products). A real run would supply real photos. Supply shared placeholder assets
to *both* arms identically so neither pays inference to generate them, and the
review-diff reflects authoring, not asset fabrication.

**F4 — Per-scenario token attribution is coarse on Pro.** We only get one
subagent total per arm. The per-scenario *diff* (via commits) is clean and is the
better containment signal anyway. Phase 1 (API, per-request `usage`) gives true
per-scenario tokens — keep create separate from revision scenarios there.

**F5 — One-time learning cost dominates Clodsite's tokens.** The Clodsite agent
spent significant inference reading `validate-plan.mjs`, the catalog component,
and `base.njk` to learn how the constrained system behaves (e.g. that `catalog`
renders display-only without a `commerce` block, that `prose` allows HTML). A
steady-state user (or a run with the catalog/docs supplied in cached context)
would not re-pay this. For a fair inference comparison, either (a) provide the
component catalog/docs in-context, or (b) measure a separate *warm edit* pass.
This is the single biggest confounder behind the token result.

**F6 — Schema papercuts (product feedback, not benchmark bugs).** `catalog` is
image-forward with no first-class image-less listing and no weight/size field;
`quote` mandates an image; there is no FAQ/accordion component. These nudged the
agent toward workarounds. Worth a roadmap look independent of the benchmark.

**F7 — FAQ interaction can't be verified headless.** Neither subagent could
"click" to confirm expand/collapse; both verified markup only. The 7b acceptance
item ("expands on click, collapses on second click") needs a browser/headless
check (e.g. the web-perf / Chrome DevTools MCP) or it's unverifiable — an
acceptance-method gap to resolve before 7b counts.

## Acceptance (light, self-run — not blind)

Both arms self-reported clean builds, all requested content present, and drift by
construction (untouched sections). A rigorous blind acceptance + cumulative
regression pass was not performed this round (orchestrator also ran setup). For a
shakeout that's acceptable; Phase 1 needs a reviewer separate from the runner.

## Net

The harness works end to end. One real harness bug (F1), one scenario that needs
redesign (F2), two fairness adjustments (F3, F5), and a measurement gap (F7) —
all cheap to fix before any Phase-1 spend. And we have a first, coarse, two-sided
signal: **containment favors the plan; cold-build inference did not.** Worth the
zero dollars it cost.
