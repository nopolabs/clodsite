# Clodsite Benchmarks

Starter kit for running the experiment defined in
[`../docs/benchmark-protocol.md`](../docs/benchmark-protocol.md). Read the
protocol first — this directory is the concrete material it refers to.

## What's here

| Path | What it is | Who sees it |
|---|---|---|
| `briefs/ridgeline-coffee.md` | Owner-level briefs, one per scenario — the **shared input** handed verbatim to both arms | The agent |
| `acceptance/ridgeline-coffee.md` | Per-scenario acceptance checklists + the cumulative regression list | The reviewer only |
| `rubric.md` | Site-agnostic scoring rules — delivery gap, defects, regressions, blind review | The reviewer |
| `results/TEMPLATE.md` | Fillable per-run results sheet | The reviewer |
| `runs/` | One subdirectory per run (`<date>/<arm>/`) holding logs, transcripts, branches, filled results | — |

## The fixture

A single evolving site — **Ridgeline Coffee Roasters**, a small two-person
roaster — carried through the whole scenario arc. Using one site that grows
(create → reposition → add page → add catalog → enable checkout → reskin → add
section → add FAQ) is deliberate: iterative edits are where code drift
accumulates, which is the thing the benchmark measures. Add more fixtures later
for robustness.

## How to run a scenario (both arms)

1. Pick the scenario. Hand the agent **only that scenario's brief section** from
   `briefs/ridgeline-coffee.md`, verbatim — nothing from `acceptance/` or
   `rubric.md`. The agent must not see the acceptance criteria.
2. The agent works **autonomously** — authoring, building, validating,
   previewing, iterating — on its own branch off the pinned baseline, until it
   declares the site deliverable or hits the autonomy cap. No human help mid-run.
3. At the self-declared deliverable, apply the scenario's acceptance checklist
   **blind and without editing** (see `rubric.md`). Record the delivery gap and
   defects, then run the cumulative regression check.
4. Record everything in a copy of `results/TEMPLATE.md` under
   `runs/<date>/<arm>/`.

Both arms get the **same brief** and the **same acceptance checklist**. The
Clodsite arm authors `build-plan.yaml`; the control arm hand-builds a small
conventional site (default: minimal Eleventy + Markdown). See the protocol §3
for fairness controls.

## Phase 0 vs Phase 1

Start with the **Phase 0 Pro pilot** (N = 1 per arm) to refine these artifacts
and capture rough token usage for budgeting. The published numbers come from the
**Phase 1 API run** (N ≥ 3, per-request usage capture). See the protocol's
*Execution phases* section.

## Scenario map

| # | Scenario | Brief section | Tests |
|---|---|---|---|
| 1 | Create a 3-page site | `01-create` | Build-from-brief |
| 2 | Reposition the home page | `02-reposition` | Containment / drift |
| 3 | Add an About page | `03-add-page` | Containment / drift |
| 4 | Add a product catalog | `04-catalog` | New capability |
| 5 | Enable checkout + fulfillment | `05-checkout` | New capability (heaviest) |
| 6 | Make it bolder (reskin) | `06-reskin` | Containment / drift |
| 7a | Add testimonials + CTA | `07a-compose` | Containment (existing components) |
| 7b | Add a collapsible FAQ | `07b-faq` | Extensibility (unsupported shape) |
| 8 | Rebuild, no change | *(none)* | Build determinism |
