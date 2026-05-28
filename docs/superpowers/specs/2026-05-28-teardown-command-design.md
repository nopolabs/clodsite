# `/teardown` Command — Design Spec

**Date:** 2026-05-28
**Status:** Approved for implementation

---

## Problem

v1 deploys sites but provides no way to remove them from Cloudflare Pages without going to the dashboard manually. `NEXT-STEPS.md` documents the manual steps, but a destructive remote action deserves a governed command with a confirmation gate — not a dashboard hunt.

---

## Goal

A `/teardown <site-name>` command that deletes the Cloudflare Pages project and takes the site offline, with a typed-confirmation safety gate. An optional `clean` flag also removes local files.

---

## Architecture: `[HYBRID]`

LLM handles the confirmation gate (builds destruction summary, requires typed site name). A new `scripts/teardown.sh` handles the wrangler deletion call.

---

## Command Flow

```
[LLM]    Get site name from args — if missing, prompt and stop
[SCRIPT] bash scripts/migrate-site.sh
[LLM]    Read sites/<name>/site-spec.json
         Build destruction summary:
           - Pages project: <slug>
           - Live URL: <meta.deployed_url> (if set)
           - Custom domain: <domain.hostname> (if domain.custom = true)
         Show summary and ask:
           "Type the site name to confirm: "
         Wait for exact match against <site-name>. If no match, abort.
[SCRIPT] SITE_DIR=sites/<name> bash scripts/teardown.sh
[SCRIPT] (if 'clean' flag) bash scripts/clean.sh <name>
[LLM]    Interpret output
```

**`clean` flag:** `/teardown <site-name> clean` removes the Pages project AND runs `clean.sh` to delete `sites/<name>/`. `/teardown <site-name>` removes only the Pages project — local files are untouched.

---

## `scripts/teardown.sh`

### Logic

1. Guard: `SITE_DIR` set, spec exists, `.env` exists and has credentials
2. Derive project slug: slugify `spec.site.name` (same formula as `deploy.sh`)
3. If `spec.meta.deployed_url` is not set: print warning "No recorded deployment URL — proceeding anyway" (project may still exist in Pages)
4. Run: `wrangler pages project delete <slug> --yes`
5. On exit 0: print `✓ Deleted Pages project '<slug>'. The live site and all deployment history are gone.`
6. On non-zero: print wrangler error output and exit 1

No local file changes — `clean.sh` handles that if the `clean` flag was passed by the command.

---

## `NEXT-STEPS.template.md` Change

Replace the current "Remove this site" section (manual dashboard instructions) with:

```markdown
## Remove this site

Run `/teardown {{SITE_NAME}}` to delete the Cloudflare Pages project and take
the site offline. This is permanent — the live site and all deployment history
are gone. Your local files in `sites/{{SITE_NAME}}/` are unaffected.

To also delete local files: `/teardown {{SITE_NAME}} clean`
```

---

## Files Created / Modified

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/teardown.sh` | Create | wrangler deletion call |
| `.claude/commands/teardown.md` | Create | Command definition with confirmation gate |
| `scripts/templates/NEXT-STEPS.template.md` | Modify | Replace manual removal section |
| `scripts/test/run-tests.sh` | Modify | Add teardown.sh unit tests |

---

## Testing

### Automated (`run-tests.sh`)

- Missing `SITE_DIR` → exits 1
- Missing spec file (`site-spec.json` not present) → exits 1
- Spec with no `site.name` → exits 1

Note: the `.env` check is not unit-tested (running from repo root where `.env` exists makes it untestable in isolation). Same constraint as `domain.sh`.

### Manual Checklist

- [ ] `/teardown ndig` shows correct summary (slug, URL, custom domain); wrong confirmation aborts; correct site name → project deleted, site goes offline
- [ ] `/teardown ndig clean` → project deleted + `sites/ndig/` removed
- [ ] `/teardown` with no site name → prompts and stops
- [ ] `/teardown ndig` on a site with no `meta.deployed_url` → proceeds with warning, deletes project

---

## What Does Not Change

- `scripts/clean.sh` — unchanged; teardown delegates to it for local file removal
- `scripts/deploy.sh` — unchanged
- Spec schema — no new fields needed
