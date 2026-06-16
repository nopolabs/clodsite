# Benchmark Run — ridgeline-coffee — 2026-06-15 — Control arm

```
Phase:          0 (Pro pilot)
Arm:            Control
Model:          claude-opus-4-8 (inherited; subagent)
Agent harness:  general-purpose subagent (single invocation, full arc)
Control stack:  minimal Eleventy + Nunjucks + base CSS (control-repo)
Baseline:       control 9151421 (git init of control-repo seed)
Autonomy cap:   none (run to self-declared done)
Token capture:  subagent total only (coarse) — ~34,300 tokens, 37 tool calls, ~6.0 min
Trials (N):     1
Scenario order: fixed (01,02,03,04,06,07a,07b)
Reviewer blind: no (self-run pilot)
```

## Per-scenario (review-diff = everything under src/)

| # | Review-diff (lines) | Build | Notes |
|---|---|---|---|
| 01 create | 1753 | pass | index/coffee/contact + nav + CSS; large first commit |
| 02 reposition | 21 | pass | H1/lead reorder + founder blockquote + blockquote CSS |
| 03 add page | 23 | pass | about.md + nav link |
| 04 catalog | 67 | pass | products.md grid (no buy buttons) + card CSS |
| 06 reskin | 132 | pass | CSS-only: palette, type scale, header/footer, cards, buttons |
| 07a testimonials+CTA | 56 | pass | testimonial cards + "Shop our coffee" pill + CSS |
| 07b FAQ | 72 | pass | native `<details>`/`<summary>` + CSS (+/− marker), no JS |

Per-scenario token attribution: not available (coarse, one subagent total).
Self-correction cycles: ~7 builds, all first-try (one verify-command hiccup, not a build).

## Determinism (scenario 8)

Double `npm run build` of unchanged final source → identical `_site` hash.
**Identical ✓**

## Delivery gap / regressions

Self-reported (not blind): all requested content present; drift by construction;
no regressions. One judgment call: FAQ placed on home page, no nav item (brief
didn't specify). Rigorous blind acceptance pass deferred (F7).

## Final state

5 pages (home, coffee, products, about, contact). Files under src/: base.njk,
base.css, index.md, coffee.md, products.md, about.md, contact.md. Builds clean.
