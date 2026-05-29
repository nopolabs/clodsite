# Sites Version Control — Design Spec

**Date:** 2026-05-29
**Status:** Approved for implementation

---

## Problem

`sites/` is gitignored from the clodsite repo — the repo is the tool, sites are the output. But there's no version history for site content: specs, build plans, and deployed URLs accumulate on disk with no record of when they changed or what was live at any point in time.

---

## Goal

Give `sites/` its own git repository, initialized automatically during `/setup`, with a commit automatically recorded after each successful `/deploy`. No configuration required. No remote management.

Physical separation (making `sites/` configurable to an external path) is explicitly deferred to a future feature.

---

## Approach

**Always-on, no opt-in.** `/setup` always initializes `sites/` as a git repo — `git init` is idempotent so re-running setup is safe. `deploy-finalize.sh` commits after each successful deploy. If `sites/.git` doesn't exist (pre-feature setup), the commit step is silently skipped.

---

## Files Changed

### `scripts/setup.sh` — new `--init-sites` mode

A new mode that:
1. Creates `sites/` if it doesn't exist
2. Runs `git -C sites init` (idempotent)
3. Writes `sites/.gitignore` if not already present — never overwrites an existing one

```
--init-sites   initialize sites/ as a git repo (idempotent)
```

### `sites/.gitignore` (new file, written by `--init-sites`)

```
*/src/
*/dist/
*/.deploy-*
```

Tracked: `site-spec.json`, `build-plan.md`, `NEXT-STEPS.md`, `images/`
Ignored: all generated output (`src/`, `dist/`, `.deploy-*`)

### `.claude/commands/setup.md` — call `--init-sites`

Add one script step at the end of the setup flow, after `--verify` succeeds:

```
[SCRIPT] bash scripts/setup.sh --init-sites
```

### `scripts/deploy-finalize.sh` — auto-commit on deploy

After writing the production URL and `NEXT-STEPS.md`, if `sites/.git` exists:

```bash
SITE_NAME=$(basename "${SITE_DIR}")
if [ -d "sites/.git" ]; then
  git -C sites add "${SITE_NAME}/"
  git -C sites commit -m "deploy: ${SITE_NAME} → ${PROD_URL}" || true
fi
```

Commit message format: `deploy: <site-slug> → <production-url>`

Example: `deploy: nopolabs → https://nopolabs.pages.dev`

If the commit fails for any reason (nothing to commit, git not configured, etc.), it is silently ignored — deploy success must not depend on git state.

---

## What Does Not Change

- No remote management — user adds a remote and pushes manually
- No auto-push
- No new `.env` config flags
- No changes to any other scripts
- Physical path of `sites/` is unchanged (deferred to roadmap)
- `/teardown` makes no git commit — the last deploy commit remains as the final record

---

## Rollout / Existing Installations

`deploy-finalize.sh` guards with `if [ -d "sites/.git" ]` — existing installations that haven't re-run `/setup` continue to work exactly as before. Re-running `/setup` is safe and sufficient to opt in.

---

## Roadmap Dependency

Physical separation of `sites/` (configurable path, external repo) is tracked in `ROADMAP.md` as a pending item. That feature will build on this one: once `sites/` is a git repo, pointing it at a different path and adding a remote becomes straightforward.
