# Benchmark Run — ridgeline-coffee — 2026-06-15 — Clodsite arm

```
Phase:          0 (Pro pilot)
Arm:            Clodsite
Model:          claude-opus-4-8 (inherited; subagent)
Agent harness:  general-purpose subagent (single invocation, full arc)
Baseline:       clodsite engine aa8b881 (worktree bench/phase0-clodsite); scratch SITES_DIR
Autonomy cap:   none (run to self-declared done)
Token capture:  subagent total only (coarse) — ~92,100 tokens, 61 tool calls, ~11.6 min
Trials (N):     1
Scenario order: fixed (01,02,03,04,06,07a,07b)
Reviewer blind: no (self-run pilot)
```

## Per-scenario (review-diff = build-plan.yaml + commerce/ + assets/)

| # | Review-diff (lines) | of which build-plan.yaml | Build | Notes |
|---|---|---|---|---|
| 01 create | 182 | +164 | fail→pass | failed on missing engine `node_modules` (F1), then clean |
| 02 reposition | 33 | +21/-5 | pass | hero rewrite + `quote`; needed a founders SVG (quote requires image) |
| 03 add page | 58 | +57/-1 | pass | `hero`+`prose`+`key-facts`; nav updated |
| 04 catalog | 86 | +30/-1 | pass | `catalog` display-only (no `commerce` block); +catalog.json +3 SVGs |
| 06 reskin | 2 | +1/-1 | pass | `style: minimal → bold` — one line |
| 07a testimonials+CTA | 24 | +24 | pass | `prose` testimonials + `call-to-action` |
| 07b FAQ | 21 | +21 | pass | native `<details>` via `prose` html — no engine change (see F2) |

Per-scenario token attribution: not available (coarse, one subagent total).
Self-correction cycles: ~8 builds total; only scenario-01 had a real failure.

## Determinism (scenario 8)

Double build of unchanged scenario-07b source → byte-identical HTML across all 5
pages. **Identical ✓**

## Delivery gap / regressions

Self-reported (not blind): all scenarios' requested content present; drift by
construction (untouched plan sections); no regressions observed. Rigorous blind
acceptance pass deferred (F7: FAQ click-interaction unverifiable headless).

## Final state

5 pages (home, coffee, about, shop, contact). Home: hero→quote→prose→
feature-grid→cta→prose(testimonials)→cta. No engine/catalog changes. Builds clean.
