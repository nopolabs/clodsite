# Benchmark Run — <fixture> — <date>

Copy this file to `runs/<date>/<arm>/results.md` (one per arm) and fill it in.
Keep raw logs (transcripts, `git` history, build output) alongside it.

## Run metadata

```
Fixture:        ridgeline-coffee
Phase:          0 (Pro pilot)  |  1 (API)
Arm:            Clodsite  |  Control
Model:          <e.g. claude-opus-4-8>   (pinned ID)
Agent harness:  <e.g. Claude Code vX>
Control stack:  <e.g. minimal Eleventy + Markdown>   (control arm only)
Baseline commit (clodsite): <sha>
Run branch:     <branch or worktree>
Autonomy cap:   <tokens / turns / wall-clock>
Token capture:  <per-request usage  |  Pro subscription report (coarse)>
Trials (N):     <1 for Phase 0; ≥3 for Phase 1>
Scenario order: <fixed as listed  |  randomized — record it>
Reviewer blind: <yes/no>
```

## Per-scenario results

Repeat this block per scenario per trial. Tokens: in / out (and cache read /
write if available).

```
### Scenario <#> — <name>   [trial <t>]

Tokens (in/out):        ______ / ______      (cache read/write: ______ / ______)
Wall-clock:             ______
Review-diff (lines):    ______   (7b: incl. new component source)
Validation failures:    ______
Self-correction cycles: ______
Delivery gap:           ______   (acceptance fails: ___  + defects: ___)
  - failed items / defects (with severity):
      - [blocker|major|minor] ...
Regressions:            ______
  - prior items now failing (scenario → item → page):
      - ...
Status:                 completed  |  capped  |  blocked (reason: ____)  |  invalid (limit-truncated)
Notes:
```

## Scenario 08 — determinism

```
Build A hash (normalized):  ____________
Build B hash (normalized):  ____________
Identical?                  yes / no
Normalization applied:      <fields excluded, e.g. timestamps>
```

## Run summary

```
Total tokens (in/out):      ______ / ______
Total wall-clock:           ______
Scenarios completed / capped / blocked: ___ / ___ / ___
Phase-0 note: rough $ estimate from these tokens (for API budgeting): ______
Protocol issues found this run (feed back into the briefs/acceptance/rubric):
  - ...
```
