# Phase-0 pilot run — 2026-06-15

Bug-shakeout run (N = 1 per arm). Goal: exercise the protocol and harness end to
end, find what breaks, and capture rough token usage — **not** to produce
headline numbers.

## Decisions

- **Scope:** scenarios 1, 2, 3, 4, 6, 7a, 7b, 8. **Checkout (#5) deferred** (needs
  Stripe test keys, KV, a real inbox, a verified sender — not staged this round).
- **Runner:** one fresh subagent per arm, run sequentially (Pro plan); orchestrator
  scores afterward (not blind — accepted limitation of a self-run pilot).
- **Model:** inherits this session (Opus 4.8).
- **Autonomy cap:** run to self-declared done per scenario; orchestrator aborts +
  records if a run clearly spirals.

## Pinned baselines

- Clodsite engine: `aa8b881` (worktree branch `bench/phase0-clodsite`)
- Control baseline: `9151421` (`git init` of `benchmarks/control-repo` seed)

## Workspaces (scratch, outside the repos)

```
/Users/danrevel/lab/projects/_bench-phase0/
  clodsite-engine/   git worktree on bench/phase0-clodsite; .env → scratch SITES_DIR
  clodsite-sites/    isolated SITES_DIR; the `ridgeline` site is built here
  control/           pinned control baseline (git), npm installed, builds clean
```

No deploy this round — build + local preview only, so no Cloudflare/Stripe creds
needed. The live `clodsite-sites` repo is untouched.

## Per-scenario harness convention

The agent commits after each scenario (`scenario-NN: <name>`) so review-diff per
scenario = that commit's diff. Token/time per-scenario attribution is coarse on
Pro — recorded best-effort; precise per-request usage is a Phase-1 (API) thing.

## Outputs

- `clodsite/` and `control/` — filled `results.md` (from `../../results/TEMPLATE.md`),
  transcripts/logs.
- Bugs and protocol issues found this run feed back into the briefs / acceptance /
  rubric / instructions before any Phase-1 spend.
