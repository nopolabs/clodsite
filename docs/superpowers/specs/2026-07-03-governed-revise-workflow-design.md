---
type: Spec
title: "Governed Revise Workflow Design"
description: "Design for the preview-and-revise workflow: capture feedback, propose a plan diff, report the blast radius mechanically, deploy only after approval. Not yet implemented."
tags: ["workflow", "revise", "maintenance", "governance"]
status: draft
timestamp: 2026-07-03T00:00:00Z
---

# Governed Revise Workflow Design

**Date:** 2026-07-03
**Status:** Proposed
**Roadmap entry:** Governed preview-and-revise workflow (pending item 7)
**Builds on:** explicit redirects (item 9), the sites-repo commit model
(deploy-finalize auto-commit), deterministic builds

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
is clean between deploys (deploy-finalize auto-commits). So after the agent
edits the plan and rebuilds:

- `git diff -- <site>/build-plan.yaml` **is** the proposal, and
- `git diff --name-only -- <site>/dist` **is** the blast radius — the exact
  set of routes the revision changes, adds, or removes.

Determinism is what makes the second diff meaningful: any changed output must
trace to a changed input. A revision report over these two diffs is the one new
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
what changed) plus the `git diff` of the authored inputs.

### 3. Report `[SCRIPT]` — `scripts/revise-report.sh <site>`

The one new script. It answers "what will this revision do to the live site"
from evidence, not narrative:

1. `validate-plan.sh` — a proposal that doesn't validate is not presentable.
2. Rebuild `dist/` from scratch (the standard Build pipeline; delete the old
   `dist/` first so removed pages cannot linger as stale files).
3. `git diff --name-only HEAD -- "<site>/dist"` and map built paths to
   routes: `dist/index.html` → `/`, `dist/<p>/index.html` → `/<p>/`,
   `dist/404.html` → the not-found page, `_headers`/`_redirects` → policy
   files, everything else → assets.
4. Print the **revision report**: routes changed / added / removed; policy
   and asset changes; the authored-input diff stat; and a **warning for every
   removed route not covered by a `from` rule in the new `_redirects`**.

Read-only with respect to git (it rebuilds `dist/` in the working tree but
commits nothing), credential-free, and offline — same class as `validate-plan`.

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
- **abandons** → `git checkout -- "<site>/"` restores the exact deployed
  state (the clean-at-rest tree makes abandonment lossless and total).

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
| `scripts/revise-report.sh` | `[SCRIPT]` | validate → clean rebuild → dist diff → route-mapped report + redirect check |
| Route mapping | `.mjs` helper | dist paths → routes; unit-testable |
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
- **One page's prose edited** → exactly that page's route listed as changed;
  no other routes.
- **Page removed without a redirect** → route listed as removed **and**
  flagged; adding a covering `redirects` rule clears the flag.
- **Nav reordered** → all page routes listed as changed (honest chrome blast).
- **Asset added** → reported under assets, not routes.
- **Invalid plan** → report refuses at step 1 with validate-plan's errors.
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
