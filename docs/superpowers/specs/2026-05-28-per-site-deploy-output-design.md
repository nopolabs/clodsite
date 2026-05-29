# Per-Site Deploy Output Files — Design Spec

**Date:** 2026-05-28
**Status:** Approved

## Problem

`scripts/.deploy-output`, `scripts/.deploy-error`, and `scripts/.deploy-exit` are shared files overwritten by every `/deploy` run. Deploying two sites back-to-back and then re-running finalize on the first site reads the second site's output, producing the wrong production URL.

## Solution

Move the three files into each site's own directory (`sites/<name>/`) so deploy state is per-site and independent.

## Changes

### `scripts/deploy.sh`

Replace the three hardcoded `scripts/` paths with `$SITE_DIR`:

```bash
# Before
wrangler pages deploy ... > scripts/.deploy-output 2> scripts/.deploy-error
echo "$WRANGLER_EXIT" > scripts/.deploy-exit

# After
wrangler pages deploy ... > "${SITE_DIR}/.deploy-output" 2> "${SITE_DIR}/.deploy-error"
echo "$WRANGLER_EXIT" > "${SITE_DIR}/.deploy-exit"
```

Also remove the now-unnecessary `mkdir -p scripts` line (the site directory already exists at this point in the flow).

### `scripts/deploy-finalize.sh`

Replace the two hardcoded `scripts/` references with `$SITE_DIR`:

```bash
# Before
if [ ! -f "scripts/.deploy-output" ]; then ...
BUILD_URL=$(grep ... scripts/.deploy-output | tail -1)

# After
if [ ! -f "${SITE_DIR}/.deploy-output" ]; then ...
BUILD_URL=$(grep ... "${SITE_DIR}/.deploy-output" | tail -1)
```

### `.claude/commands/deploy.md`

Update the error-path reference in the LLM error-interpretation step:

```
# Before
Read `scripts/.deploy-error`. Interpret the error...

# After
Read `sites/<site-name>/.deploy-error`. Interpret the error...
```

### `.gitignore`

Replace the three `scripts/.deploy-*` entries with a single wildcard:

```
# Before
scripts/.deploy-output
scripts/.deploy-error
scripts/.deploy-exit

# After
sites/*/.deploy-*
```

## What Does Not Change

- `clean.sh` — already deletes `sites/<slug>/` entirely; deploy output files there are removed automatically.
- Error-interpretation behavior — the LLM still reads and interprets the error file; only the path changes.
- Local (`--local`) deploy path — no output files written; unaffected.

## No Migration Needed

Any existing `scripts/.deploy-*` files are ephemeral artifacts; they can be left in place or deleted manually. The `.gitignore` change means they'll stop being ignored by their old pattern, but since they're already ignored by the old entries in git history, this is a non-issue for committed state.
