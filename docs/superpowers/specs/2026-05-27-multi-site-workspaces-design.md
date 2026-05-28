# Multi-site Workspaces — Design Spec

**Date:** 2026-05-27
**Status:** Approved

---

## Overview

Clodsite v1 treats the repo as a single-site workspace: one clone builds one site in `site/`. This spec generalizes that to `sites/<slug>/`, so a single Clodsite checkout can build and manage multiple sites against one Cloudflare account.

The design is shaped by a longer-term vision: commands are transitional scaffolding around what will ultimately become a spec-in / site-out pipeline. Stage 1 (LLM inference) fills in spec details; Stage 2 (deterministic scripts) renders the spec as a deployed site. The command layer should stay thin and explicit so it can shrink over time without leaving structural debt.

---

## Directory Structure

`site/` is retired. All per-site artifacts live under `sites/<slug>/`:

```
sites/
  acme-corp/
    site-spec.json
    build-plan.md
    dist/
    images/
    NEXT-STEPS.md
  ndig/
    site-spec.json
    build-plan.md
    dist/
    images/
    NEXT-STEPS.md
.env                  ← shared across all sites (account-scoped credentials)
scaffold/             ← shared ephemeral build workspace
```

`scaffold/src/_data/site.json` and `scaffold/src/*.njk` remain ephemeral — written fresh per build, not committed. The scaffold is a single shared workspace; only one site can be building at a time, which is correct for an interactive CLI tool.

### Cloudflare credentials

`.env` holds `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` at the repo root, shared by all sites. These are account-scoped credentials, not site config. Managing sites across different Cloudflare accounts requires a separate repo clone. No per-site credential files are introduced.

---

## Script Parameterization

### `SITE_DIR` environment variable

All scripts replace hardcoded `site/` with `${SITE_DIR}`. Commands export `SITE_DIR` before invoking any script:

```bash
export SITE_DIR=sites/acme-corp
bash scripts/validate-spec.sh
bash scripts/write-site-json.sh
bash scripts/build-site.sh
```

Every script that currently hardcodes `site/` is updated. The convention is one env var, set once by the command, inherited by all subprocesses.

### Scripts to update

| Script | Change |
|--------|--------|
| `check-artifacts.sh` | Check `sites/` directory listing instead of `site/` |
| `clean.sh` | Accept site slug arg; delete `sites/<slug>/` instead of `site/` |
| `write-spec.sh` | Write to `${SITE_DIR}/site-spec.json` |
| `validate-spec.sh` | Default spec path to `${SITE_DIR}/site-spec.json` |
| `write-site-json.sh` | Read spec from `${SITE_DIR}/site-spec.json` |
| `apply-theme.sh` | Read spec from `${SITE_DIR}/site-spec.json` |
| `build-site.sh` | Output to `${SITE_DIR}/dist`; images from `${SITE_DIR}/images` |
| `deploy.sh` | Read spec from `${SITE_DIR}/site-spec.json`; deploy `${SITE_DIR}/dist` |
| `deploy-finalize.sh` | Read/write `${SITE_DIR}/site-spec.json`; write `${SITE_DIR}/NEXT-STEPS.md` |

### `.eleventy.js`

Reads `process.env.SITE_DIR` to parameterize the output path and images passthrough:

```js
const siteDir = process.env.SITE_DIR;
if (!siteDir) throw new Error('SITE_DIR is not set. Export it before running Eleventy.');

module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy({ [`${siteDir}/images`]: "images" });
  return {
    dir: {
      input: "src",
      output: `${siteDir}/dist`,
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "html"],
    htmlTemplateEngine: "njk"
  };
};
```

`SITE_DIR` is required — no silent default. Every command exports it before invoking scripts.

---

## Command Changes

Each command takes `<site-name>` as its first argument. The LLM validates the argument is present, then exports `SITE_DIR=sites/<site-name>` before invoking any scripts.

### `/interview <site-name>`

1. Validate `<site-name>` is provided; error if not.
2. Check `sites/<site-name>/` does not already exist (error if it does — use `/build` or `/plan` to continue an existing site).
3. `mkdir -p sites/<site-name>` and `mkdir -p sites/<site-name>/images`.
4. Export `SITE_DIR=sites/<site-name>`.
5. Run the interview. The site name question is pre-answered with `<site-name>`; do not ask it again.
6. Write `${SITE_DIR}/site-spec.json` and run `bash scripts/write-spec.sh`.

### `/plan <site-name>`

1. Export `SITE_DIR=sites/<site-name>`.
2. Run `bash scripts/validate-spec.sh`.
3. Generate `${SITE_DIR}/build-plan.md`.

### `/build <site-name>`

1. Export `SITE_DIR=sites/<site-name>`.
2. Run `bash scripts/write-site-json.sh`.
3. Run `bash scripts/apply-theme.sh`.
4. LLM generates `scaffold/src/<page>.njk` for each page.
5. Run `bash scripts/build-site.sh`.

### `/deploy <site-name>`

1. Export `SITE_DIR=sites/<site-name>`.
2. Run `bash scripts/deploy.sh` (reads spec and dist from `${SITE_DIR}`).
3. On success, run `bash scripts/deploy-finalize.sh`.

### `/setup clean <site-name>`

Deletes `sites/<site-name>/` and the associated scaffold artifacts (`scaffold/src/*.njk`, `scaffold/src/_data/site.json`). Bare `/setup clean` (no site name) lists available sites and prompts for which one to clean.

---

## Auto-migration

On the first command that receives a site name, if `site/site-spec.json` exists:

1. Read the slug from `site/site-spec.json` → `spec.site.name` lowercased/hyphenated.
2. Print: `Detected existing site/ — migrating to sites/<slug>/...`
3. Run `bash scripts/migrate-site.sh` which does `mv site/ sites/<slug>/`.
4. Continue with the command as normal.

`migrate-site.sh` is a new script, ~10 lines. It is idempotent: if `sites/<slug>/` already exists, it exits with an error rather than overwriting.

After migration, `site/` no longer exists. The command continues normally with `SITE_DIR=sites/<slug>`.

---

## What Does Not Change

- `.env` — location and format unchanged.
- `scaffold/` — directory structure, Eleventy version, CSS themes, `_includes/` — all unchanged.
- `site-spec.json` schema — unchanged. `spec.site.name` continues to be the source of the slug.
- `/setup` (credential flow) — unchanged; credentials are not site-scoped.

---

## Out of Scope

- Managing sites across multiple Cloudflare accounts from one repo clone.
- A `/list` command (users can `ls sites/`).
- Concurrent builds of multiple sites.
