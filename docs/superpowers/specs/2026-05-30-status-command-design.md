---
type: Spec
title: "`/status` Command Design"
description: "Design for the /status command."
tags: ["status", "commands"]
status: shipped
timestamp: 2026-05-30T00:00:00Z
---

# `/status` Command Design

**Date:** 2026-05-30
**Status:** Approved

---

## Overview

`/status` is a read-only command that cross-references local `sites/` with live Cloudflare Pages state. It shows each Clodsite-managed site's production URL, custom domain, and last deploy timestamp — then lists any Cloudflare Pages projects that exist outside Clodsite's knowledge.

---

## Architecture

`/status` is a `[SCRIPT]`-only command. No LLM inference is needed — the output is a deterministic join between local YAML and live Cloudflare data.

```
[SCRIPT] bash scripts/status.sh
```

`CLAUDE.md` receives a new `/status` entry in the Commands section, placed after `/teardown`.

---

## Data Sources

| Source | What it provides |
|--------|-----------------|
| `sites/*/build-plan.yaml` | Local slug for each Clodsite-managed site |
| `wrangler pages project list --json` | Live CF state: project name, domains, last modified |

`build-plan.yaml` is the authoritative local source; `site-spec.json` is not read by this command.

---

## Data Flow

1. Source `.env` for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. Glob `sites/*/build-plan.yaml`. Read each file's `slug` field via an inline `node -e` snippet (using `js-yaml`). Write result as JSON to a temp file.
3. Run `wrangler pages project list --json`. Write output to a second temp file.
4. A second `node -e` snippet reads both temp files, joins on slug, and renders the table.
5. Temp files are removed via `trap … EXIT`.

### Join logic

- **Matched** (local slug = CF `Project Name`): split `Project Domains` on `", "` — the `.pages.dev` entry is the URL column; any non-`.pages.dev` entry is the Custom Domain column (or `—`); `Last Modified` is the Last Deploy column.
- **Local only** (no matching CF project): URL and Custom Domain show `—`; Last Deploy shows `⚠ not deployed`.
- **CF only** (no local `sites/` dir): collected into the footer line; not shown in the main table.

---

## Output Format

Auto-sized column widths (computed from data at render time). Box-drawing characters match the existing `deploy-finalize.sh` style.

```
┌───────────┬─────────────────────┬───────────────────┬──────────────┐
│ Site      │ URL                 │ Custom Domain     │ Last Deploy  │
├───────────┼─────────────────────┼───────────────────┼──────────────┤
│ clodsite  │ clodsite.pages.dev  │ clodsite.com      │ 22 hours ago │
│ ndig      │ ndig.pages.dev      │ ndig.nopolabs.com │ 1 day ago    │
│ nopolabs  │ nopolabs.pages.dev  │ nopolabs.com      │ 1 day ago    │
└───────────┴─────────────────────┴───────────────────┴──────────────┘

Other Cloudflare Pages projects (not managed by Clodsite): anchovy, medicarion, mtw4, bbpp, hmc
```

A not-yet-deployed local site:
```
│ newsite   │ —                   │ —                 │ ⚠ not deployed │
```

The footer line is omitted when all CF projects have a matching local `sites/` dir.

---

## Error Handling

| Condition | Behavior |
|-----------|----------|
| `.env` missing | `Error: .env not found. Run /setup first.` → exit 1 |
| No `sites/*/build-plan.yaml` found | `No Clodsite-managed sites found. Run /interview first.` → exit 0 |
| `wrangler pages project list` fails | Print raw wrangler stderr → exit 1 |

---

## Files Changed

| File | Change |
|------|--------|
| `scripts/status.sh` | New script |
| `CLAUDE.md` | New `/status` command entry after `/teardown` |
| `ROADMAP.md` | Move `/status` from Pending to Completed |
