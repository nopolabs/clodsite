# Unified Build Contract Design

**Date:** 2026-05-29
**Status:** Approved
**Roadmap entry:** Unified build contract (merge spec config into build-plan)

---

## Problem

`write-site-json.sh` (used by `/build`) reads structural config — display name, style, nav, contact — from `site-spec.json`. Page content lives in `build-plan.json`. This split means `/build` has two input files and the spec is not truly "interview scratch-state only" as the roadmap intends.

The one field `build-plan.json` lacks that `write-site-json.sh` needs is the human-readable site display name. Everything else (`style`, `tone`, `nav.order`, `pages[].id`, `pages[].title`, `contact`) is already generated into the plan by `/plan`.

---

## Design

### `build-plan.json` schema changes

Two field changes:

1. `site_name` renamed to `slug` — the URL-safe deploy identifier (e.g. `"nopolabs"`)
2. `name` added — the human-readable display name (e.g. `"Nopo Labs"`), injected by `finalize-plan.sh`

```json
{
  "slug": "nopolabs",
  "name": "Nopo Labs",
  "overview": "...",
  "style": "minimal",
  "tone": "casual",
  "pages": [
    { "id": "home", "title": "Home", "content": "..." }
  ],
  "nav": { "order": ["home"] },
  "contact": { "enabled": false },
  "build_notes": ""
}
```

### New script: `finalize-plan.sh`

Runs at the end of `/plan`, after the LLM generates `build-plan.json`. Three steps:

1. Read `spec.site.name` from `site-spec.json`
2. Inject it as `name` into `build-plan.json` and write back
3. Call `validate-plan.sh` to confirm the completed plan is valid before the user reviews it

This keeps `name` injection deterministic — the LLM generates content, the script handles config promotion.

### `/plan` command sequence

```
[SCRIPT] bash scripts/validate-spec.sh
[LLM]    Generate sites/<site-name>/build-plan.json   (generates slug, not name)
[SCRIPT] SITE_DIR=sites/<site-name> bash scripts/finalize-plan.sh   ← new
```

### `validate-plan.sh` changes

- Check for `slug` field (renamed from `site_name`)
- Check for `name` field (new required field)

### `write-site-json.sh` changes

Switches source from `site-spec.json` to `build-plan.json`. Reads:

- `plan.name` → `site.name`
- `plan.style` → `site.style`
- `plan.nav.order` + `plan.pages` → `site.nav.pages` (same construction logic)
- `plan.contact` → `site.contact`

Drops `purpose`, `audience`, and `tone` from the written `site.json` — none are referenced by any Nunjucks template.

### `site.json` output (after)

```json
{
  "name": "Nopo Labs",
  "style": "minimal",
  "nav": {
    "order": ["home"],
    "pages": [{ "id": "home", "title": "Home", "href": "/" }]
  },
  "contact": { "enabled": false }
}
```

---

## Full change surface

| File | Change |
|---|---|
| `build-plan.json` (schema) | `site_name` → `slug`; add `name` field |
| `scripts/finalize-plan.sh` | New: inject `name` from spec, call `validate-plan.sh` |
| `scripts/validate-plan.sh` | Require `name`; check `slug` not `site_name` |
| `scripts/write-site-json.sh` | Read from `build-plan.json`; drop unused fields from `site.json` |
| `skills/plan.md` | Generate `slug` instead of `site_name`; note `name` is script-injected |
| `CLAUDE.md` | Add `finalize-plan.sh` step to `/plan` sequence |
| `scripts/test/fixtures/valid-build-plan.json` | Update schema: `slug`, `name` |
| `scripts/test/fixtures/invalid-build-plan-missing-content.json` | Update schema |
| `sites/*/build-plan.json` | Migration: rename `site_name` → `slug`, add `name` |

---

## What does not change

- `site-spec.json` is still written by `/interview` and read by `/plan` (validate-spec.sh + LLM context). It becomes "interview scratch-state only" — not read by `/build`.
- `validate-plan.sh` still runs at the top of `/build` as a guard — cheap and harmless.
- The LLM's role in `/plan` is unchanged: generate page content and structural fields. It generates `slug` (the deploy identifier); `name` is always injected by the script.
