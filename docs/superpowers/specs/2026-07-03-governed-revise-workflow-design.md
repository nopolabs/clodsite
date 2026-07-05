---
type: Spec
title: "Governed Revise Workflow Design"
description: "Design for the Normalize → Revise → Decide workflow: normalize to latest Clodsite, implement a requested site change, report the blast radius mechanically, deploy only after approval."
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
authored-input edit** (a preflight running only after edits cannot tell
proposal dirt from pre-existing dirt); `dist/` is report-owned (reset to `HEAD`
and rebuilt, never a reason to refuse); and git runs from the resolved worktree
root with root-relative paths, since `SITE_DIR` is the per-site directory, not
the repo root.
**Revised 2026-07-05** after field testing on `anchovy`: the desired customer
workflow is **Normalize → Revise → Decide**. A site change is always made on
the latest Clodsite, so generated static output and generated Functions from a
newer compiler/runtime are first deployed as their own normalization baseline.
Only then does the web-designer agent implement the requested revision and
produce a customer-facing revision report.

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
propose-review-apply cycle). The workflow is used by an **AI agent acting as a
web designer**: it has received a customer change request, and its job is to
make that change safely, explain what will change, and deploy only after
approval.

The workflow has three phases:

1. **Normalize** — build and deploy the site's current authored state with the
   latest Clodsite. This snapshots a baseline that includes current static
   output, generated Functions, headers/redirects, and deploy-finalize
   artifacts.
2. **Revise** — implement the requested site change against that normalized
   baseline and generate a mechanical revision report.
3. **Decide** — approve and deploy, amend and re-report, or reject and abandon
   the revision.

The policy is simple and load-bearing: **all site changes are made on the
latest Clodsite**. If a site has not already been built and deployed with the
current Clodsite version, the first step is not "edit the site"; it is
"normalize the site." That keeps Clodsite compiler/runtime drift separate from
the customer's requested revision.

The crux — and the reason this needs almost no new machinery — is that the
governance is **mechanically checkable**, not procedural. The sites repo
commits both the authored inputs and generated artifacts (`dist/`, generated
Functions, and deployment metadata), and its working tree is clean between
deploys (deploy-finalize auto-commits). That clean-at-rest baseline is
load-bearing: a diff only reads as "the revision" if nothing unrelated was
dirty when it started, and if compiler/runtime drift has already been separated
into a normalization deploy. Starting from that normalized tree, after the
agent edits the inputs and rebuilds:

- `git diff --name-status` over the site's **authored-input surface** **is**
  the proposal, and
- generated-artifact diffs (`dist/` routes/assets/policy files, and generated
  Functions where relevant) **are** the blast radius.

The **authored-input surface** is the defined set of source paths a revision
may touch: `build-plan.yaml`, `assets/`, and — once item 20 lands — collection
entry directories. It is *not* just `build-plan.yaml` (Revise legitimately
edits assets and, later, collection entries). A single helper enumerates it, so
the proposal diff, normalization/revision preflights, and abandon all agree on
exactly which paths are "authored input" versus generated output.

Determinism is what makes the blast-radius diff meaningful: after normalization,
any changed output must trace to a changed authored input. A revision report
over these diffs is the customer-facing evidence; normalization output may be
interesting to the agent/operator, but it is not the customer's requested-change
report.

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

## The actor — web-designer agent

The primary user of this workflow is an **AI web-designer agent** working on
behalf of an operator or client-facing developer. The agent has received a
change request such as "update the hours," "make the Treats page heading
clearer," or "add this photo." Its motivation is not to develop Clodsite; its
motivation is to modify one Clodsite-built website while preserving customer
trust:

- the site is first brought up to the latest Clodsite baseline;
- the requested change is scoped to authored inputs;
- the report explains the requested revision's blast radius;
- the customer/operator approves before deploy.

The requester/customer does **not** need to understand normalization drift.
They care about the requested change. Normalization is an operator/agent
maintenance step that ensures the requested-change report is clean.

## The model — Normalize → Revise → Decide

A **revision workflow** is one governed pass through three phases.

### 1. Normalize `[SCRIPT]` + operator/agent

**Always start from the latest Clodsite.** Before making the requested edit,
the agent verifies that the target site is already normalized: its current
authored inputs have been built, deployed, and committed with the current
Clodsite compiler/runtime. If not, the agent runs the standard Deploy pipeline
against the site's current state and commits that as a normalization deploy,
for example:

```text
deploy: anchovy — refresh generated output for current Clodsite
```

Normalization captures all generated artifacts from the current Clodsite:

- `dist/` static HTML, CSS, copied assets, `_headers`, and `_redirects`;
- generated Functions such as commerce checkout/webhook handlers;
- deploy-finalize artifacts such as `NEXT-STEPS.md` and site knowledge docs;
- external deploy state that the Deploy pipeline provisions.

This is a real deploy, not only a local check. Generated Functions and Pages
configuration are part of the running site. If Clodsite changed, the running
site should first be brought to that current runtime baseline before a customer
revision is judged.

The workflow may produce an internal **normalization report** (for example,
routes/functions changed by the newer compiler), but that report is not the
customer-facing revision report. It is operational evidence for the agent and
operator. The customer-facing report begins only after the site is normalized
and the requested change is implemented.

If the site working tree is already dirty before normalization, stop. That dirt
is pre-existing state: name the paths and have the operator commit, stash,
clean, or explicitly abandon them before proceeding.

### 2. Revise `[LLM]` + `[SCRIPT]`

With a normalized clean baseline, the agent captures and implements the
requested change.

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

The agent then runs the revision report script.

#### Revision report `[SCRIPT]` — `scripts/revise-report.sh <site>`

The one new script. It answers "what will this revision do to the live site"
from evidence, not narrative.

**Invocation contract.** The script ships in the Clodsite repo, but the
evidence (plan, generated artifacts, git history) lives in the sites repo. It
resolves the site the same way every other Clodsite script does — through
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

1. **Assert the normalized baseline still holds.** The authoritative baseline
   is the normalization deploy. The only *authored-input* paths that may be
   dirty are the proposal's — if unrelated site paths are dirty, the workflow
   has been polluted mid-revision, so the script refuses and names them. The
   report does **not** refuse on dirty generated artifacts that it owns and
   regenerates; the amend loop re-runs this script, so generated output left
   dirty by a prior run is expected, not drift.
2. **Reset the report-owned output**, then `validate-plan.sh` — restore `dist/`
   and generated Functions to `HEAD` so the diff in step 4 is HEAD output vs
   freshly rebuilt output, never contaminated by a prior run; a proposal that
   doesn't validate is not presentable.
3. Rebuild generated artifacts from scratch (the standard Build pipeline;
   delete old `dist/` first so removed pages cannot linger as stale files, and
   regenerate Functions when the plan requires them).
4. `git diff --name-status HEAD -- "<site>/dist"` — `--name-status` (not
   `--name-only`) so add/modify/delete come straight from git's `A`/`M`/`D`
   rather than being re-inferred. Map built paths to routes: `dist/index.html`
   → `/`, `dist/<p>/index.html` → `/<p>/`, `dist/404.html` → the not-found
   page, `_headers`/`_redirects` → policy files, everything else → assets.
   Also diff generated Functions (`<site>/functions`) as runtime artifacts.
5. Print the **revision report**: routes changed (`M`) / added (`A`) / removed
   (`D`); policy, asset, and generated-Function changes; the authored-input
   `--name-status` diff; and a **warning for every removed route not covered
   by a `from` rule in the new `_redirects`**.

Read-only with respect to git history (it rebuilds generated artifacts in the
working tree but commits nothing), credential-free, and offline — same class as
`validate-plan`.

The report doubles as a **determinism verifier**: run against an unchanged
plan it must be empty. Any noise (timestamps, ordering) is a compiler bug —
exactly the byte-for-byte reproducibility the vision brief says we verify
rather than assert — and gets filed, not worked around.

### 3. Decide `[LLM]` + human + `[SCRIPT]`

Present: the request list, the summary, the plan diff, and the report. The
standard of review is **every affected route is either requested or
explained** — a prose edit on one page affecting one route; a nav change
affecting all routes, flagged as such in the proposal. Offer a local preview
(**Deploy** in `local` mode) before the decision. The requester then:

- **approves** → run the existing **Deploy** workflow, unchanged, with the
  revision summary as the deploy message — so the sites-repo commit
  (`deploy: <site> — <summary>`) records what was asked and shipped;
- **amends** → return to Revise with the delta, then re-run the report;
- **abandons** → restore the exact deployed state. This is **not** a bare
  `git checkout -- "<site>/"`: that restores tracked files but leaves *untracked*
  ones behind — a newly added asset, or regenerated output from Revise — so
  the tree would not actually return to the deployed state. Abandon must both
  restore tracked paths (`git restore`/`checkout`) **and** remove the untracked
  paths the revision introduced. Because Normalize guaranteed a clean baseline,
  everything untracked now is the revision's own doing, so a
  scoped `git clean` over `SITE_DIR` is safe — but the implementation must
  **print exactly what it will delete and require confirmation** before
  removing anything (a governance workflow may never surprise-delete an
  operator's files). Only with tracked-restore + confirmed untracked-clean is
  abandonment genuinely "lossless and total."

Git history in the sites repo **is** the revision log; no parallel changelog is
introduced. The normalization deploy and approved revision deploy are separate
commits when both are needed.

## Who requests, who approves

Today the operator may play all three roles (requester, approver, operator),
and the workflow still earns its keep as a self-check — the report catches an
agent's overreach before it ships. With an external client (item 25), the
roles split naturally: the client supplies the change request and the final
yes/no; the operator/agent handles normalization, implementation, reporting,
and deployment. Nothing in the workflow needs to change for that split — which
is the point of designing the approval step in now.

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
- **Not auto-apply.** No revision deploys without a Decide approval, ever.
  That includes "trivial" changes — the report is cheap enough that skipping
  it saves nothing.
- **Not for Clodsite development.** Changing components, themes, schemas, or
  scripts is development-agent work with its own workflow (branch + PR). A
  revision that needs a product change stops and says so.

## New machinery inventory

Deliberately small:

| Piece | Kind | Notes |
|---|---|---|
| Normalize step | workflow + existing Deploy | builds/deploys the current site with the latest Clodsite before any requested revision; separates compiler/runtime drift from customer changes |
| Baseline check | part of `/revise` | verifies the site is clean at rest after normalization; names pre-existing dirt so it can't be folded into the proposal |
| `scripts/revise-report.sh` | `[SCRIPT]` | re-assert normalized baseline → reset+rebuild report-owned generated artifacts → validate → `--name-status` generated diff → route/function report + redirect check; git runs from the resolved worktree root with root-relative paths |
| Authored-input surface | `.mjs`/shell helper | enumerates the paths a revision may touch (`build-plan.yaml`, `assets/`, collection dirs); shared by baseline checks, proposal diff, and abandon so all three agree |
| Route mapping | `.mjs` helper | dist paths → routes; unit-testable |
| Abandon | part of the workflow | tracked-restore + confirmed scoped `git clean` of untracked; never surprise-deletes |
| **Revise** workflow section | `AGENTS.md` | phases, editing rules, agent-neutral steps |
| `/revise` command | `.claude/commands/revise.md` | thin trigger over the AGENTS.md workflow |
| Authoring guidance | `docs/agent-authoring.md` | capture/translation rules, out-of-catalog routing |

No plan-schema change, no new validate-plan rules (the redirect-coverage check
lives in the report because it needs git history, which `validate-plan` — by
design credential-free *and* history-free — should not acquire).

## Testing

Fixture: a small site in a temp git repo with plan + generated artifacts
committed (the report's contract is git-relative, so tests exercise it against
real history, mirroring how deploy-finalize tests already work).

- **Normalization required** — if the current site has not been built/deployed
  with the current Clodsite, the workflow produces a normalization deploy before
  any customer revision; generated `dist/` and generated Functions do not ride
  along in a content-change deploy commit.
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
  `build-plan.yaml` or asset edit that pre-dates the revision) → the baseline
  check names it and refuses to proceed, so it is never folded into the
  proposal.
- **A dirty `dist/` from a prior report run does not block a re-run** → the
  amend loop (edit → report → edit → report) succeeds; the report resets and
  regenerates `dist/` rather than treating its own prior output as drift.
- **Generated Functions drift is normalized first** → a site whose generated
  checkout/webhook Functions are stale for current Clodsite gets a normalization
  deploy; the subsequent revision report only includes Function changes if the
  requested authored-input change actually affects them.
- **Report git resolution** → running the report with `SITE_DIR` pointed at a
  per-site subdirectory still diffs the correct root-relative generated paths
  (git resolved from the worktree root), not paths relative to the wrong cwd.
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
- **Item 20 (content collections)** — adds collection entries to the Revise
  edit surface and collection routes to the report (via the same
  route-mapping the build already defines); no design change here.
- **Item 24 (analytics/owner reporting)** — the natural pair: `/report`
  surfaces what to change, **Revise** changes it.
- **Item 25 (client readiness)** — the requester/approver split above is the
  workflow half of onboarding client #1; slice 2 preview is its fast-follow.
- **Item 18 (theme ceiling)** — goal-level feedback ("make it feel more
  premium") often lands on theme levers; brand tokens widen what Revise can
  propose without leaving the contract.
