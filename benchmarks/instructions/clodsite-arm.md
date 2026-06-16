# Clodsite-arm instructions

Hand this to the agent at the start of a Clodsite-arm run, alongside the current
scenario's brief from `../briefs/ridgeline-coffee.md`. It defines how this arm
operates. Do **not** include any acceptance criteria.

---

You are building and maintaining a website for a small business **using
Clodsite**. Work autonomously to a deliverable site.

**Read these first** (so you don't reverse-engineer the engine):

- `docs/authoring-build-plan.md` — how to author a `build-plan.yaml`: structure,
  build/validate commands, and the non-obvious behaviors (reskin = change `style`;
  `catalog` renders display-only without a `commerce` block; where assets live).
- `components/CATALOG.md` — the component vocabulary. Use only supported types.

**Your working state**

- You are in a git worktree on a pinned Clodsite baseline commit. Do not work on
  `main`; stay on your run branch.
- One-time setup in this worktree: run `npm install` in the repo root before your
  first build (otherwise `validate-plan` fails with `ERR_MODULE_NOT_FOUND`).
- The site lives at `$SITES_DIR/ridgeline/`. Its authoring contract is
  `$SITES_DIR/ridgeline/build-plan.yaml` — the inference boundary. Everything
  after a valid plan is deterministic scripts.
- **Placeholder images are provided** at `benchmarks/assets/ridgeline/` (hero,
  founders, and three product images). Use these where a component or page needs
  an image — copy them into the site's `assets/` (or `commerce/assets/`). Do not
  fabricate your own images.
- A customer brief follows these instructions. Treat it as the site owner's
  request.

**How you work**

- Produce the deliverable by authoring and revising `build-plan.yaml`, then
  building.
- Self-service commands available to you (run and observe them yourself):
  - validate: `SITE_NAME=ridgeline bash scripts/validate-plan.sh`
  - build the full pipeline:
    ```
    for s in validate-plan write-site-json apply-theme render-templates \
             render-functions build-site render-headers; do
      SITE_NAME=ridgeline bash scripts/$s.sh || { echo "FAILED at $s"; break; }
    done
    ```
  - verify by reading the generated HTML in `$SITES_DIR/ridgeline/dist/` — do not
    start a dev server (it blocks).
  - for scenarios that need live behavior (forms, checkout): deploy and provision
    as the Clodsite workflow does (commerce/Turnstile/KV). Credentials are
    supplied to you by the harness.
- **Do not inject raw HTML/JS or `<script>` into `prose` as an escape hatch** —
  `prose` is for textual content. When the catalog cannot express something the
  brief needs (e.g. an interactive widget), **author a new constrained component**
  (`components/<name>/` with `schema.json` + `component.njk` + `component.css`,
  then `bash scripts/generate-catalog-md.sh`). Site-local components are not yet
  supported, so add it to the catalog **on your branch** (it stays off `main`).
  This is a legitimate, expected part of the work.

**Autonomy and "done"**

- Work without human guidance or correction. Author, build, validate, preview,
  and iterate on your own.
- Stop when **you** judge the site a deliverable for the brief, or when you reach
  the run's budget cap. Say so clearly when you stop. Do not ask for review or
  approval mid-run.
