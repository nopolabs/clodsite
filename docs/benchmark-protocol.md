# Clodsite Benchmark Protocol

A repeatable way to measure whether Clodsite's central claim is true:

> Working through a small, reviewable plan costs less inference and produces more
> stable changes than building and editing a conventional site directly.

This document defines the experiment, the fairness controls, the scenarios, the
metrics, and a results template. It exists so the claim can be stated with a
real number — or disproven — and so later architecture work (selectable
libraries, schema migration) can be shown to help rather than merely differ.

---

## Scope: this is the first of two benchmarks

This first benchmark deliberately measures **functional correctness and
cost/stability only** — does each arm produce a correct, working, deployable
site, and at what cost in tokens, review-diff size, validation failures,
regressions, and build determinism. Acceptance here is structural and
functional (see §4).

**Visual polish is intentionally out of scope.** Clodsite's themed, constrained
components deliver spacing, rhythm, and typographic consistency that an
unconstrained build must earn by hand — a genuine advantage, but a subjective
one that would confound the raw cost numbers if folded in now. We capture the
unpolished baseline first.

A **planned second benchmark** will measure polish on its own terms: hold a
visual-quality bar constant across both arms (a written rubric, blind review)
and compare the *cost to clear it*, plus a visual-defect count to test whether
constraint prevents visual drift across edits. That work waits until this
benchmark's results are in.

---

## 1. The two things we baseline

**A. Comparative baseline — validates the headline claim.**
The same work is performed two ways and compared:

- **Clodsite arm:** an agent authors `build-plan.yaml`; Clodsite compiles and
  deploys.
- **Control arm:** the same agent builds and edits a small conventional site
  directly.

The delta between the arms *is* the product thesis.

**B. Regression baseline — the "before" snapshot.**
The Clodsite arm's numbers are frozen as today's reference. When selectable
libraries and schema-driven validation land, the same scenarios are re-run and
compared, so the architecture is judged on evidence (fewer invalid
generations, smaller diffs, equal-or-lower tokens) rather than intuition. This
is time-sensitive: once the architecture changes, "today's Clodsite" can no
longer be measured.

---

## 2. The shared input: an owner-level brief

Both arms start from the **same input**: a high-level site spec written the way
a non-technical site owner would describe it — plain language, goals and
content, no implementation detail, no component names, no YAML.

A brief is natural language plus any raw material an owner would actually hand
over (copy, a logo, a product list). It must **not** contain Clodsite-specific
vocabulary; converting owner intent into a buildable artifact is precisely the
work being measured.

Example create brief (abbreviated):

```text
I run a two-person bookkeeping practice for local restaurants. I need a simple
site: a home page that explains what we do and who we help, a services page with
our three packages and rough pricing, and a contact page with an email form.
Friendly but professional. Here's our current blurb and the package list: ...
```

Revisions are delivered the same way — as owner-level change requests
("the pricing changed, and can the home page lead with a customer quote?"), not
as diffs or field edits.

Maintain a small, fixed library of briefs under `benchmarks/briefs/` so runs are
reproducible. The primary run uses **one evolving site** (a create brief
followed by a sequence of change requests against that same site), because
iterative edits are where code drift actually accumulates — the exact thing the
claim is about. Run additional fixture sites for robustness.

---

## 3. Fairness controls

The result is only as honest as these controls:

- **Same brief** into both arms, verbatim.
- **Same agent and model**, pinned to a specific version, same harness and
  settings.
- **Same acceptance criteria** per scenario, written *before* the run and
  applied identically to both arms (see §4).
- **Fair control stack — not a strawman.** The control is a *small conventional
  site* a competent builder would actually choose, **not** a heavyweight SPA
  framework. Default control: **minimal Eleventy + Markdown/Nunjucks, authored
  by hand, no component system.** This shares Eleventy with Clodsite on purpose,
  so the variable under test is "author via plan + component catalog + compiler"
  versus "author templates and content directly" — not "which static-site
  generator." Run a second control of plain hand-written HTML/CSS for
  robustness if desired.
- **Fresh context per scenario** in both arms (no carried-over conversation
  advantage), except where a scenario explicitly tests iterative revision on an
  existing site — in which case both arms keep their own prior output.
- **"Done" is objective.** A scenario ends when its acceptance checklist passes,
  not when the agent says it's finished.
- **Multiple trials.** Agent runs vary; do **N ≥ 3** trials per scenario per arm
  and report the **median** (note spread). Fix or randomize scenario order
  consistently across arms and record which.

---

## 4. Scenarios

The primary arc runs against a single evolving fixture site, in order. Each
scenario lists the owner-level input and an acceptance checklist used to define
"done" and to detect regressions.

| # | Scenario | Owner-level input | Acceptance (abbrev.) |
|---|---|---|---|
| 1 | Create a 3-page site | Full create brief | 3 pages exist, nav works, content matches brief, deploys, no broken links |
| 2 | Revise positioning | "Lead the home page with our value, move the quote up" | Home reorders as asked; other pages unchanged |
| 3 | Add a page | "Add an About page with our story, link it in the nav" | New page + nav entry; existing pages unchanged |
| 4 | Add a product catalog | "We want to sell three products with prices" | Catalog renders 3 products with prices/images |
| 5 | Enable checkout + fulfillment | "Let people actually buy, email us each order" | Checkout works end to end; order recorded; fulfillment fires |
| 6 | Change the theme/visual style | "Make it bolder / switch the look" | Visual style changes site-wide; content unchanged |
| 7 | Extend a component / content shape | "Add a testimonials section to the home page" | New section present and correct; rest unchanged |
| 8 | Rebuild with no change | (none — rebuild twice from unchanged source) | Output identical across builds (determinism) |

Scenarios 2, 3, 6, 7 are the **drift detectors**: each has an explicit "other
pages unchanged" clause, because silent collateral breakage on edit is the
failure mode Clodsite claims to avoid.

---

## 5. Metrics

Record per scenario, per arm, per trial.

| Metric | How to capture | Claim it tests |
|---|---|---|
| Input / output **tokens** | Agent session usage (note cached vs. uncached) | "Contained, less inference" — economic core |
| **Wall-clock time** | Start→accept timer | Practical speed |
| **Files read / changed** | Session tool log; `git` | Scope of work per change |
| **Review diff size** | Lines changed in the *human-reviewed source* (`build-plan.yaml` for Clodsite; templates+content for control) via `git diff --stat` | "Changes confined to a small reviewable artifact" |
| **Validation failures** | Count of failed `validate-plan` runs (Clodsite) / failed builds, type/lint errors (control) before "done" | "Agents can't ship an invalid site" — governance |
| **Human corrections** | Count + line-size of manual edits after the agent declares done | Quality of first-pass output |
| **Regressions** | Re-run the *prior* scenarios' acceptance checklists after each edit; count previously-passing checks now failing | "No code drift" — the differentiator |
| **Build determinism** | Build twice from unchanged source; hash `dist/` (excluding known nondeterministic fields like timestamps); compare | "Deterministic by design" — verified, not asserted |

Notes:
- The **review diff** is the headline measurement for the containment claim:
  what a human (or agent) must actually read and approve to make a change. For
  Clodsite that is the plan; generated `dist/` is excluded from review-diff
  because it is compiler output, not source.
- **Regressions** are cumulative: after scenario *k*, re-check scenarios *1..k-1*.
- For **determinism**, normalize away legitimately variable output (build
  timestamps, hashes-of-hashes) before comparing; document the normalization.

---

## 6. Procedure

For each arm:

1. **Setup.** Pin the model/agent version. Create a clean working location.
   Record environment (versions of Clodsite, Node, the control stack).
2. **Per scenario, per trial:**
   a. Reset to the post-previous-scenario state (or clean, for scenario 1).
   b. Start the token + time meters.
   c. Hand the agent the owner-level input verbatim.
   d. Let it work to completion; count validation failures / failed builds.
   e. Apply the acceptance checklist. Make the minimum human corrections needed
      to pass; record their count and size.
   f. Run the cumulative regression checklist; record failures.
   g. Stop meters; record all metrics.
3. **Determinism (scenario 8):** from the final unchanged source, build twice;
   normalize and compare hashes.
4. Repeat for N trials; compute medians and spread.

Keep raw logs (session transcripts, `git` history, build outputs) under
`benchmarks/runs/<date>/<arm>/` so any number can be audited later.

---

## 7. Results template

One row per scenario; report median of N trials, with spread in parentheses.

```text
Run date:        2026-__-__
Model/agent:     <name @ version>
Clodsite ver:    <commit>
Control stack:   minimal Eleventy + Markdown
Trials (N):      3
```

| # | Scenario | Arm | Tokens (in/out) | Time | Review diff (lines) | Valid. fails | Human fixes | Regressions |
|---|---|---|---|---|---|---|---|---|
| 1 | Create | Clodsite | | | | | | |
| 1 | Create | Control | | | | | | |
| 2 | Reposition | Clodsite | | | | | | |
| 2 | Reposition | Control | | | | | | |
| … | | | | | | | | |

Determinism (scenario 8):

| Arm | Build A hash | Build B hash | Identical? | Normalization applied |
|---|---|---|---|---|
| Clodsite | | | | |
| Control | | | | |

Summary line per arm — the headline deltas:

```text
Clodsite vs Control (median across revision scenarios 2,3,6,7):
  tokens:        −__%        review diff:   −__ lines
  regressions:   __ vs __    human fixes:   __ vs __
```

---

## 8. Threats to validity

State these alongside any published number; they are how a skeptic will attack
it.

- **Baseline choice.** A flattering control (a heavyweight framework) inflates
  every delta. The default minimal-Eleventy control is deliberately fair; report
  the control stack prominently.
- **Agent variance.** Single runs are noise. Report medians over N trials and
  the spread; never publish a one-shot number.
- **Order / learning effects.** Iterative scenarios benefit the arm that goes
  second within a session. Fix order across arms and disclose it; prefer fresh
  context except where revision is the thing under test.
- **Reviewer subjectivity.** "Human corrections" depends on the judge. Use a
  fixed acceptance checklist and, ideally, a reviewer blind to which arm produced
  the output.
- **Model drift.** Re-runs on a newer model aren't comparable to old numbers.
  Pin and record the version; re-baseline when the model changes.
- **Scenario coverage.** Eight scenarios on one site is a start, not proof.
  Expand the brief library before treating results as general.

---

## 9. What a passing result looks like

The thesis is supported if, across the revision scenarios, the Clodsite arm
shows **materially smaller review diffs and fewer regressions** at **equal or
lower token cost**, with **build determinism holding**. If the deltas are small
or negative, that is itself a finding — it tells us the constrained-plan approach
isn't yet paying for its constraints, and points the library/schema work at the
right problem. Either outcome is more useful than an unmeasured claim.
