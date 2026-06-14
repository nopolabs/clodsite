# Scoring Rubric (site-agnostic)

How to turn a self-declared deliverable into the metrics the protocol records.
Applies to any fixture. Read alongside `../docs/benchmark-protocol.md` §5–§8.

## Ground rules

- **Blind.** The reviewer scoring a deliverable should not know which arm
  produced it. Strip arm-identifying paths/labels before review where practical.
- **No editing.** Score the deliverable exactly as the agent left it at "done."
  Do not fix-and-continue. What the agent shipped autonomously is the unit of
  measurement.
- **First benchmark = functional only.** Score correctness and stability, not
  visual quality. Defer all aesthetic judgment to the second (polish) benchmark.

## Metrics to record (per scenario, per arm, per trial)

Capture into a copy of `results/TEMPLATE.md`. From the protocol §5:

| Metric | How |
|---|---|
| **Tokens** | Input/output (and cache read/write if available). Phase 1: per-request `usage`. Phase 0 (Pro): whatever the subscription reports — note the method. |
| **Wall-clock time** | Start of run → self-declared "done." |
| **Review-diff size** | Lines changed in the *human-reviewed source* (`git diff --stat`): `build-plan.yaml` for Clodsite; templates + content for the control. For the extensibility scenario (7b), **include any new component source the agent wrote** (schema + template + styles) — not just the plan. |
| **Validation failures** | Count of failed `validate-plan` (Clodsite) / failed builds, type/lint errors (control) the agent hit during the run. |
| **Self-correction cycles** | Build/validate/preview → fix loops before "done." |
| **Delivery gap** | Acceptance items failed **+** defects found at "done" (below). |
| **Regressions** | Previously-passing acceptance items now failing (below). |

## Delivery gap

At the self-declared deliverable, run the scenario's acceptance checklist.

```
delivery gap = (# acceptance items failed) + (# functional defects found)
```

A lower delivery gap means a more complete autonomous first delivery. Record the
list, not just the count.

### Functional defect categories (first benchmark)

Count any of these found while applying the checklist:

- **Broken route/link** — a nav entry or link that 404s or dead-ends.
- **Missing requested content** — something the brief asked for that isn't there.
- **Wrong data** — incorrect price, email, name, count (e.g. $17 shown as $7).
- **Unresolved build/validation failure** — the agent declared done with the
  site not building, or validation still failing.
- **Broken interaction** — an interactive element that doesn't work (e.g. the FAQ
  doesn't expand/collapse; checkout doesn't complete; fulfillment email never
  fires).
- **Collateral change** — a page or feature the brief said to leave alone was
  altered (this is also a regression — see below; count it once, under
  regressions, when it breaks a prior acceptance item).

Do **not** count as defects: visual/aesthetic preferences, spacing/typography,
or anything the brief didn't ask for.

### Severity (for triage, not weighting)

Tag each failed item / defect so results can be ranked, but the headline count
is unweighted:

- **Blocker** — site unusable for the scenario's purpose (won't build; checkout
  fails; FAQ inert).
- **Major** — requested capability present but wrong (wrong price; About missing
  the story).
- **Minor** — cosmetic-but-functional miss (a redundant nav entry; a slightly
  off label).

## Regressions (cumulative)

After scoring scenario *k*, re-verify the acceptance checklists of scenarios
*1 … k−1* against the same deliverable.

```
regressions = # of previously-passing acceptance items that now fail
```

Regressions are the **code-drift signal** — the thing the constrained-plan
approach claims to suppress. Record which prior items broke and on which page.

## Capped & truncated runs (don't average them in)

- If a run hits the **autonomy cap** before a deliverable, record it as
  **capped** with the metrics so far; report capped runs separately, do not
  fold them into medians.
- If a Phase-0 run is cut off mid-flight by the **Pro 5-hour limit**, it is
  **invalid** — discard and redo from the pinned baseline. Never count it.

## Reporting

Per the protocol §7, report medians across the revision scenarios (2, 3, 6, 7a)
for the headline containment/drift deltas, and report the extensibility scenario
(7b) **separately** with all reviewed source counted. State the model, the arm
stacks, the phase, and the trial count alongside every number.
