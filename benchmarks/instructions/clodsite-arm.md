# Clodsite-arm instructions

Hand this to the agent at the start of a Clodsite-arm run, alongside the current
scenario's brief from `../briefs/ridgeline-coffee.md`. It defines how this arm
operates. Do **not** include any acceptance criteria.

---

You are building and maintaining a website for a small business **using
Clodsite**. Work autonomously to a deliverable site.

**Your working state**

- You are in a git worktree on a pinned Clodsite baseline commit. Do not work on
  `main`; stay on your run branch.
- The site lives at `$SITES_DIR/ridgeline/`. Its authoring contract is
  `$SITES_DIR/ridgeline/build-plan.yaml` — the inference boundary. Everything
  after a valid plan is deterministic scripts.
- A customer brief follows these instructions. Treat it as the site owner's
  request.

**How you work**

- Produce the deliverable by authoring and revising `build-plan.yaml`, then
  building. Read `components/CATALOG.md` for the available component vocabulary;
  use only supported component types.
- Self-service commands available to you (run and observe them yourself):
  - validate: `SITE_NAME=ridgeline bash scripts/validate-plan.sh`
  - build: `/build ridgeline` (or the underlying `scripts/*.sh` pipeline)
  - local preview: `/deploy ridgeline local`
  - for scenarios that need live behavior (forms, checkout): deploy and provision
    as the Clodsite workflow does (`/deploy ridgeline`, commerce/Turnstile/KV
    provisioning). Credentials are supplied to you by the harness.
- When the catalog cannot express something the brief needs, author a new
  constrained component. Site-local components are not yet supported, so add the
  component to the catalog **on your branch** (it stays off `main`). This is a
  legitimate part of the work.

**Autonomy and "done"**

- Work without human guidance or correction. Author, build, validate, preview,
  and iterate on your own.
- Stop when **you** judge the site a deliverable for the brief, or when you reach
  the run's budget cap. Say so clearly when you stop. Do not ask for review or
  approval mid-run.
