---
type: Spec
title: "Governed Revise Workflow Design"
description: "Design for the preview-and-revise workflow: capture feedback, propose a plan diff, report the blast radius mechanically, deploy only after approval. Not yet implemented."
tags: ["workflow", "revise", "maintenance", "governance"]
status: accepted
timestamp: 2026-07-04T00:00:00Z
---

# Governed Revise Workflow Design

**Date:** 2026-07-03
**Status:** Accepted
**Roadmap entry:** Governed preview-and-revise workflow (pending item 7)
**Builds on:** explicit redirects (item 9), the sites-repo commit model
(deploy-finalize auto-commit), deterministic builds
**Revised 2026-07-04** over two review rounds. Round 1: the proposal and
abandon operations span the whole authored-input surface (not just
`build-plan.yaml`); `git diff --name-status`; abandon spelled out for untracked
files. Round 2: the clean baseline is **captured at revision start, before any
phase-2 edit** (a preflight running only after edits cannot tell proposal dirt
from pre-existing dirt); `dist/` is report-owned (reset to `HEAD` and rebuilt,
never a reason to refuse); and git runs from the resolved worktree root with
root-relative paths, since `SITE_DIR` is the per-site directory, not the repo
root.

---

## Summary

Clodsite's core promise is a site that is **easy to change forever after** — yet
changing a deployed site today is the least-governed part of the product. An
agent edits `build-plan.yaml` ad hoc, runs **Deploy**, and the change is live.
It works because the operator is also the author and the approver; nothing in
the workflow *proposes* a change, shows *exactly what it will touch*, or waits
for a *yes* before publishing.

This design adds a first-class **Revise** workflow (evolving the long-planned
`/modify`; renamed because "modify" names a mutation while "revise" names the
propose-review-apply cycle). A revision moves through five phases: **capture**
the request, **propose** a targeted plan diff, **report** the blast radius
mechanically, **approve** (or amend or abandon), **apply** via the existing
Deploy pipeline.

The crux — and the reason this needs almost no new machinery — is that the
governance is **mechanically checkable**, not procedural. The sites repo
commits both the authored inputs and the built `dist/`, and its working tree
is clean between deploys (deploy-finalize auto-commits). That clean-at-rest
baseline is load-bearing: a diff only reads as "the revision" if nothing
unrelated was dirty when it started — so the workflow **captures and verifies
the clean baseline at revision start, before any edit** (phase 1), because a
check that runs only after edits cannot separate the proposal from dirt that
was already there. So starting from that verified-clean tree, after the agent
edits the inputs and rebuilds:

- `git diff --name-status` over the site's **authored-input surface** **is**
  the proposal, and
- `git diff --name-status -- <site>/dist` **is** the blast radius — the exact
  set of routes the revision changes (`M`), adds (`A`), or removes (`D`).

The **authored-input surface** is the defined set of source paths a revision
may touch: `build-plan.yaml`, `assets/`, and — once item 20 lands — collection
entry directories. It is *not* just `build-plan.yaml` (phase 2 legitimately
edits assets and, later, collection entries). A single helper enumerates it, so
the proposal diff, the baseline preflight, and abandon (phase 4) all agree on
exactly which paths are "authored input" versus generated output.

Determinism is what makes the blast-radius diff meaningful: any changed output
must trace to a changed input. A revision report over these diffs is the one new
`[SCRIPT]`; everything else is workflow definition and authoring guidance.

## Motivation

The most common request a small business makes of its website developer is
tiny: update the hours, add a photo, announce a special, make the phone number
easier to find. The competent-developer loop for that request is: restate it,
propose the change, show what it affects, get sign-off, ship, confirm. Clodsite
has every *mechanism* this needs (small plan, cheap deterministic rebuild,
git history, local preview) but no *workflow* — so today the loop lives in the
operator's discipline rather than in the product.

This becomes acute with client #1 (item 25): the requester and the approver
stop being the same person as the operator. A governed loop with an explicit
proposal artifact and an explicit approval step is the difference between
"an agent edited your website" and "your developer proposed a change and you
approved it."

## The model — a revision

A **revision** is one governed pass through five phases. Phases 1–2 and 4 are
`[LLM]`; 3 and 5 are `[SCRIPT]`.

### 1. Capture `[LLM]`

**Record the baseline first — before any edit.** The clean-at-rest guarantee
only holds *between* deploys; the moment a revision starts editing, authored
inputs go dirty, and a later check can no longer tell the proposal apart from
uncommitted work that pre-dated the revision. So `/revise` begins by confirming
`SITE_DIR` is clean at rest (per the deploy-finalize invariant). If it is
already dirty, that dirt is **pre-existing state, not the proposal**: name the
offending paths and have the operator commit, stash, or clean them before the
revision proceeds. This is the load-bearing governance gate — it closes the
hole where pre-existing `build-plan.yaml` or asset changes would otherwise be
silently folded into the proposal. Only once the baseline is verified clean do
the phase-2 edits begin, so by construction every authored-input change the
report later sees is the proposal.

Inputs, in any mix: conversation ("we're closed Mondays now"), screenshots
(the requester circles the thing), or goals ("make it clearer what we sell",
"make the primary action more prominent"). The agent restates the feedback as
a numbered list of **concrete requests** and confirms it with the requester
before touching anything. Translation guidance:

- **Screenshot** → locate the component by matching visible text against plan
  content; name the page id and component in the restatement.
- **Goal-level feedback** → enumerate the plan-level levers that serve the
  goal (component order, `hero` action emphasis, a `call-to-action`, tone of
  copy, theme choice) and propose one or two options rather than guessing.
- **Out-of-catalog requests** → say so honestly. The routing is: a different
  component or theme option that serves the intent; else a Clodsite feature
  request (development-agent scope, `ROADMAP.md`); never raw HTML/CSS, never
  a hand-edit of generated output. The escape hatch stays inside the contract.

### 2. Propose `[LLM]`

The agent makes **targeted edits** to the site's authored inputs in the
working tree: `build-plan.yaml`, `assets/`, and (once item 20 lands)
collection entries. Editing rules — the "governed" content contract:

- **Page ids are stable.** A revision never renames a page id as a side
  effect. When a request genuinely renames or removes a route, the same
  revision adds a `redirects` entry (item 9) covering the old route.
- **Untouched nodes stay untouched.** Edits mutate exactly the nodes the
  requests name; no reflowing, rewording, or "improving" of unrelated
  content. (Phase 3 proves this at the output level.)
- **Site-chrome edits are honest about their reach.** Nav, theme, `head`
  defaults, and contact settings legitimately touch every page; the proposal
  says so up front rather than letting the report surprise the approver.

The proposal artifact is a plain-language summary (one line per request →
what changed) plus the `git diff --name-status` over the **authored-input
surface** defined above — `build-plan.yaml`, `assets/`, and (once item 20
lands) collection entries — not `build-plan.yaml` alone, since asset and
collection edits are ordinary revision content.

### 3. Report `[SCRIPT]` — `scripts/revise-report.sh <site>`

The one new script. It answers "what will this revision do to the live site"
from evidence, not narrative.

**Invocation contract.** The script ships in the Clodsite repo, but the
evidence (plan, `dist/`, git history) lives in the sites repo. It resolves the
site the same way every other Clodsite script does — through
`clodsite_init_site_dir` in `scripts/lib/sites.sh`, taking a `<site>` name and
honoring `SITES_DIR`/`SITE_DIR`. Be precise about paths: `SITE_DIR` is the
**per-site directory** (`SITES_DIR/<site>`), *not* the git root — the sites repo
is the worktree that contains it. So the script resolves the worktree root once
(`git -C "$SITE_DIR" rev-parse --show-toplevel`), runs **all** git commands from
that root, and passes **root-relative** paths (`<site>/dist`, `<site>/build-plan.yaml`).
Equivalently one may `git -C "$SITE_DIR" … -- dist`, but the spec fixes the
root-relative form so `<site>/dist` in the steps below is unambiguous. This is
stated so future agents don't invent a second convention (a cwd assumption, a
separate flag) or mismatch the path against where git runs.

Steps:

1. **Assert the recorded baseline still holds.** The authoritative clean-baseline
   gate is phase 1 (before edits); the report re-asserts it cheaply. The only
   *authored-input* paths that may be dirty are the proposal's — if an
   authored-input path outside the current proposal set is dirty, the phase-1
   baseline was violated mid-revision, so the script refuses and names it. The
   report does **not** refuse on a dirty `dist/`: `dist/` is generated output
   the report *owns* and regenerates (step 3), and the amend loop re-runs this
   script, so a `dist/` left dirty by a prior run is expected, not drift.
2. **Reset the report-owned output**, then `validate-plan.sh` — restore `dist/`
   to `HEAD` (`git restore -- "<site>/dist"`) so the diff in step 4 is
   HEAD-`dist` vs a freshly rebuilt `dist`, never contaminated by a prior run;
   a proposal that doesn't validate is not presentable.
3. Rebuild `dist/` from scratch (the standard Build pipeline; delete the old
   `dist/` first so removed pages cannot linger as stale files).
4. `git diff --name-status HEAD -- "<site>/dist"` — `--name-status` (not
   `--name-only`) so add/modify/delete come straight from git's `A`/`M`/`D`
   rather than being re-inferred. Map built paths to routes: `dist/index.html`
   → `/`, `dist/<p>/index.html` → `/<p>/`, `dist/404.html` → the not-found
   page, `_headers`/`_redirects` → policy files, everything else → assets.
5. Print the **revision report**: routes changed (`M`) / added (`A`) / removed
   (`D`); policy and asset changes; the authored-input `--name-status` diff;
   and a **warning for every removed route not covered by a `from` rule in the
   new `_redirects`**.

Read-only with respect to git history (it rebuilds `dist/` in the working tree
but commits nothing), credential-free, and offline — same class as
`validate-plan`.

The report doubles as a **determinism verifier**: run against an unchanged
plan it must be empty. Any noise (timestamps, ordering) is a compiler bug —
exactly the byte-for-byte reproducibility the vision brief says we verify
rather than assert — and gets filed, not worked around.

### 4. Approve `[LLM]` + human

Present: the request list, the summary, the plan diff, and the report. The
standard of review is **every affected route is either requested or
explained** — a prose edit on one page affecting one route; a nav change
affecting all routes, flagged as such in the proposal. Offer a local preview
(**Deploy** in `local` mode) before the decision. The requester then:

- **approves** → phase 5;
- **amends** → back to phase 2 with the delta;
- **abandons** → restore the exact deployed state. This is **not** a bare
  `git checkout -- "<site>/"`: that restores tracked files but leaves *untracked*
  ones behind — a newly added asset, or the rebuilt `dist/` from phase 3 — so
  the tree would not actually return to the deployed state. Abandon must both
  restore tracked paths (`git restore`/`checkout`) **and** remove the untracked
  paths the revision introduced. Because the phase-1 preflight guaranteed a
  clean baseline, everything untracked now is the revision's own doing, so a
  scoped `git clean` over `SITE_DIR` is safe — but the implementation must
  **print exactly what it will delete and require confirmation** before
  removing anything (a governance workflow may never surprise-delete an
  operator's files). Only with tracked-restore + confirmed untracked-clean is
  abandonment genuinely "lossless and total."

### 5. Apply `[SCRIPT]`

The existing **Deploy** workflow, unchanged, with the revision summary as the
deploy message — so the sites-repo commit (`deploy: <site> — <summary>`)
records what was asked and shipped. Git history in the sites repo **is** the
revision log; no parallel changelog is introduced.

## Who requests, who approves

Today the operator plays all three roles (requester, approver, operator), and
the workflow still earns its keep as a self-check — the report catches an
agent's overreach before it ships. With an external client (item 25), the
roles split naturally over the same phases: the client supplies phase-1
feedback and the phase-4 yes; the operator (with the agent) runs everything
else. Nothing in the workflow needs to change for that split — which is the
point of designing the approval step in now.

## Preview

- **v1: local preview** — **Deploy** `local` mode at `http://localhost:8080`,
  already shipped. Sufficient while the approver sits next to the operator.
- **Slice 2: shareable remote preview** — a Cloudflare Pages **preview
  deployment** (non-production branch deploy → a `*.pages.dev` preview URL,
  production untouched) so a remote client can review before approving. This
  needs its own design pass and is deliberately not designed here; its open
  questions are real: per-environment secrets for generated Functions
  (commerce previews presumably run checkout in test mode or inert), keeping
  preview URLs out of search indexes, access control on the preview, webhook
  registration must not run for previews, and the custom domain's absence
  changing canonical URLs. None of these block v1.

## What this is not

- **Not a CMS or owner-facing UI.** The requester talks to a person or an
  agent; the workflow governs what happens next. A self-serve owner surface
  is a different product layer.
- **Not a ticket queue.** Capture is conversational; one revision is one
  sitting. Batching, scheduling, and request tracking are out of scope.
- **Not auto-apply.** No revision deploys without a phase-4 approval, ever.
  That includes "trivial" changes — the report is cheap enough that skipping
  it saves nothing.
- **Not for Clodsite development.** Changing components, themes, schemas, or
  scripts is development-agent work with its own workflow (branch + PR). A
  revision that needs a product change stops and says so.

## New machinery inventory

Deliberately small:

| Piece | Kind | Notes |
|---|---|---|
| Baseline capture | part of `/revise` (phase 1) | verifies `SITE_DIR` clean at rest **before** edits; names pre-existing dirt so it can't be folded into the proposal |
| `scripts/revise-report.sh` | `[SCRIPT]` | re-assert baseline → reset+rebuild report-owned `dist/` → validate → `--name-status` dist diff → route-mapped report + redirect check; git runs from the resolved worktree root with root-relative paths |
| Authored-input surface | `.mjs`/shell helper | enumerates the paths a revision may touch (`build-plan.yaml`, `assets/`, collection dirs); shared by baseline capture, proposal diff, and abandon so all three agree |
| Route mapping | `.mjs` helper | dist paths → routes; unit-testable |
| Abandon | part of the workflow | tracked-restore + confirmed scoped `git clean` of untracked; never surprise-deletes |
| **Revise** workflow section | `AGENTS.md` | phases, editing rules, agent-neutral steps |
| `/revise` command | `.claude/commands/revise.md` | thin trigger over the AGENTS.md workflow |
| Authoring guidance | `docs/agent-authoring.md` | capture/translation rules, out-of-catalog routing |

No plan-schema change, no new validate-plan rules (the redirect-coverage check
lives in the report because it needs git history, which `validate-plan` — by
design credential-free *and* history-free — should not acquire).

## Testing

Fixture: a small site in a temp git repo with plan + built `dist/` committed
(the report's contract is git-relative, so tests exercise it against real
history, mirroring how deploy-finalize tests already work).

- **Unchanged plan → empty report** (the determinism check; this test is the
  regression net for compiler nondeterminism).
- **One page's prose edited** → exactly that page's route listed as changed
  (`M`); no other routes.
- **Page removed without a redirect** → route listed as removed (`D`) **and**
  flagged; adding a covering `redirects` rule clears the flag.
- **Nav reordered** → all page routes listed as changed (honest chrome blast).
- **Asset added** → reported under assets, not routes.
- **Invalid plan** → report refuses with validate-plan's errors.
- **Pre-existing authored-input dirt at revision start** (an uncommitted
  `build-plan.yaml` or asset edit that pre-dates the revision) → the phase-1
  baseline check names it and refuses to proceed, so it is never folded into
  the proposal.
- **A dirty `dist/` from a prior report run does not block a re-run** → the
  amend loop (edit → report → edit → report) succeeds; the report resets and
  regenerates `dist/` rather than treating its own prior output as drift.
- **Report git resolution** → running the report with `SITE_DIR` pointed at a
  per-site subdirectory still diffs the correct `<site>/dist` (git resolved
  from the worktree root, root-relative path), not a path relative to the
  wrong cwd.
- **Abandon leaves no trace** → after a revision that adds an asset and rebuilds
  `dist/`, abandon returns `git status` on `SITE_DIR` to clean (tracked restored
  **and** the revision's untracked files removed), matching the pre-revision
  commit exactly.
- **Route mapping** unit tests: index/nested/404/`_headers`/`_redirects`/asset
  paths map to the documented labels.

## Slicing

1. **The revise loop** — `revise-report.sh` + route mapping + tests, the
   AGENTS.md workflow, the `/revise` trigger, authoring-guidance updates.
   Ships the full governed cycle with local preview.
2. **Remote preview deployments** — own design pass first (per-environment
   secrets, indexing, access, webhook suppression), then build. Unblocks
   remote-client approval; sequenced with item 25's client #1.

## Relationships

- **Item 9 (explicit redirects)** — what makes route renames governable; the
  report's removed-route check closes the loop.
- **Item 20 (content collections)** — adds collection entries to the phase-2
  edit surface and collection routes to the report (via the same
  route-mapping the build already defines); no design change here.
- **Item 24 (analytics/owner reporting)** — the natural pair: `/report`
  surfaces what to change, **Revise** changes it.
- **Item 25 (client readiness)** — the requester/approver split above is the
  workflow half of onboarding client #1; slice 2 preview is its fast-follow.
- **Item 18 (theme ceiling)** — goal-level feedback ("make it feel more
  premium") often lands on theme levers; brand tokens widen what phase 2 can
  propose without leaving the contract.
