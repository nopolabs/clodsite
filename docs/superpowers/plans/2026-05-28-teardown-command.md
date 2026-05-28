# `/teardown` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/teardown <site-name>` command that deletes a deployed Cloudflare Pages project with a typed-confirmation safety gate, plus an optional `clean` flag to also remove local files.

**Architecture:** `[HYBRID]` — LLM command file handles arg parsing, shows destruction summary, and requires typed site-name confirmation before running anything; `scripts/teardown.sh` handles the wrangler deletion call. The `clean` flag passes through to the existing `scripts/clean.sh`.

**Tech Stack:** bash, wrangler CLI (`wrangler pages project delete`), Node.js (JSON parsing)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/teardown.sh` | Create | wrangler deletion: parse slug, load credentials, delete project |
| `.claude/commands/teardown.md` | Create | Command definition: arg parsing, confirmation gate, script invocation |
| `scripts/test/fixtures/teardown-spec-no-name.json` | Create | Test fixture: valid spec with empty `site.name` |
| `scripts/test/run-tests.sh` | Modify | Add 3 teardown.sh unit tests |
| `scripts/templates/NEXT-STEPS.template.md` | Modify | Replace manual "Remove this site" section with `/teardown` reference |

---

## Task 1: Test fixture + failing tests

**Files:**
- Create: `scripts/test/fixtures/teardown-spec-no-name.json`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Create `teardown-spec-no-name.json`**

```json
{
  "site": {
    "name": "",
    "purpose": "test",
    "audience": "testers",
    "tone": "friendly",
    "style": "minimal"
  },
  "pages": [
    { "id": "home", "title": "Home", "purpose": "test", "content_outline": "test" },
    { "id": "about", "title": "About", "purpose": "test", "content_outline": "test" }
  ],
  "nav": { "order": ["home", "about"], "show_contact_link": false },
  "contact": { "enabled": false, "type": "email", "email": "" },
  "domain": { "custom": false, "hostname": "" },
  "content_status": "draft",
  "meta": { "generated_at": "2026-05-28T00:00:00Z", "spec_version": "1.0" }
}
```

- [ ] **Step 2: Add teardown.sh tests to `run-tests.sh`**

Insert this block between the `domain.sh` section and the `# ── Results` section:

```bash
# ── teardown.sh ───────────────────────────────────────────────────────────────
echo ""
echo "=== teardown.sh ==="

# Missing SITE_DIR → exits 1
SITE_DIR="" bash scripts/teardown.sh > /dev/null 2>&1; assert_exit "missing SITE_DIR exits 1" 1 $?

# Missing spec file → exits 1
rm -f "${SITE_DIR}/site-spec.json"
bash scripts/teardown.sh > /dev/null 2>&1; assert_exit "missing spec exits 1" 1 $?

# Spec with empty site.name → exits 1
cp scripts/test/fixtures/teardown-spec-no-name.json "${SITE_DIR}/site-spec.json"
bash scripts/teardown.sh > /dev/null 2>&1; assert_exit "missing site.name exits 1" 1 $?
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
bash scripts/test/run-tests.sh 2>&1
```

Expected: `=== teardown.sh ===` section shows 3 failures (script doesn't exist yet). All 16 prior tests still pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/test/fixtures/teardown-spec-no-name.json scripts/test/run-tests.sh
git commit -m "test: add teardown.sh test fixture and failing tests"
```

---

## Task 2: Create `scripts/teardown.sh`

**Files:**
- Create: `scripts/teardown.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/site-spec.json" ]; then
  echo "Error: ${SITE_DIR}/site-spec.json not found. Run /interview first."
  exit 1
fi

# Parse spec — check site.name before loading credentials
SPEC_PARSE=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('${SITE_DIR}/site-spec.json', 'utf8'));
if (!spec.site || !spec.site.name) {
  process.stderr.write('Error: site.name not set in spec.\n');
  process.exit(1);
}
const slug = spec.site.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+\$/g,'');
console.log(slug);
console.log(spec.meta && spec.meta.deployed_url ? spec.meta.deployed_url : '');
" 2>&1) || { echo "$SPEC_PARSE" >&2; exit 1; }

PROJECT_SLUG=$(echo "$SPEC_PARSE" | sed -n '1p')
DEPLOYED_URL=$(echo "$SPEC_PARSE" | sed -n '2p')

if [ -z "$DEPLOYED_URL" ]; then
  echo "Warning: No recorded deployment URL — proceeding anyway."
fi

# Load credentials
if [ ! -f ".env" ]; then
  echo "Error: .env not found. Run /setup first."
  exit 1
fi
set -a; source .env; set +a

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set in .env. Run /setup first."
  exit 1
fi

# Delete the Pages project
WRANGLER_OUT=$(wrangler pages project delete "$PROJECT_SLUG" --yes 2>&1) || {
  echo "$WRANGLER_OUT"
  exit 1
}
echo "$WRANGLER_OUT"
echo "✓ Deleted Pages project '${PROJECT_SLUG}'. The live site and all deployment history are gone."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/teardown.sh
```

- [ ] **Step 3: Run tests — verify they pass**

```bash
bash scripts/test/run-tests.sh 2>&1
```

Expected output includes:
```
=== teardown.sh ===
  ✓ missing SITE_DIR exits 1
  ✓ missing spec exits 1
  ✓ missing site.name exits 1
```

Overall: 19 passed, 0 failed (16 prior + 3 new).

- [ ] **Step 4: Commit**

```bash
git add scripts/teardown.sh
git commit -m "feat: add teardown.sh"
```

---

## Task 3: Create `.claude/commands/teardown.md`

**Files:**
- Create: `.claude/commands/teardown.md`

- [ ] **Step 1: Create the command file**

Write `.claude/commands/teardown.md` with this content (use real backticks for code fences):

```
Delete a deployed Clodsite site from Cloudflare Pages.

---

**Get site name and flags.** Look at what the user typed after `/teardown`. Extract:
- Site name: the word that isn't `clean`
- `clean` flag: `true` if the user typed `clean`

If no site name was provided:

> "Please provide a site name: `/teardown <site-name>` — e.g., `/teardown acme-corp`"

And stop.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

[code fence]bash
bash scripts/migrate-site.sh
[/code fence]

---

**[LLM]** Read `sites/<site-name>/site-spec.json` and build a destruction summary:

- **Pages project:** `<slugified site.name>` (slugify: lowercase, replace non-alphanumeric runs with `-`, strip leading/trailing `-`)
- **Live URL:** `<meta.deployed_url>` if set, otherwise "not recorded"
- **Custom domain:** `<domain.hostname>` — only include this line if `domain.custom = true`

Show the summary and ask:

> "This will permanently delete the Cloudflare Pages project and all deployment history. Your local files will be unaffected.
>
> Type **<site-name>** to confirm:"

Wait for the user's reply. If the reply does not exactly match `<site-name>`, say "Confirmation didn't match — teardown cancelled." and stop.

---

**[SCRIPT]** Delete the Pages project:

[code fence]bash
SITE_DIR=sites/<site-name> bash scripts/teardown.sh
[/code fence]

---

**[SCRIPT]** Only if `clean` flag was passed:

[code fence]bash
bash scripts/clean.sh <site-name>
[/code fence]

---

**[LLM]** Interpret the output:

- If output contains `✓ Deleted Pages project`: confirm the site is offline. If `clean` was used, confirm local files were also removed. If not, note that local files in `sites/<site-name>/` are still present and the user can run `/teardown <site-name> clean` or delete them manually.
- If the script exits with a non-zero code: explain the error clearly.

**Common errors:**
- `CLOUDFLARE_API_TOKEN … not set` → run `/setup`
- Wrangler error about project not found → the project may have already been deleted; check with `wrangler pages project list`
```

Replace `[code fence]` with ` ``` ` and `[/code fence]` with ` ``` ` when writing the file.

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/teardown.md
git commit -m "feat: add /teardown command file"
```

---

## Task 4: Update `NEXT-STEPS.template.md` + final verification

**Files:**
- Modify: `scripts/templates/NEXT-STEPS.template.md`

- [ ] **Step 1: Read the current file**

```bash
cat scripts/templates/NEXT-STEPS.template.md
```

Find the `## Remove this site` section. It currently reads:

```
## Remove this site

To take this site down, delete its Cloudflare Pages project:

1. In **Cloudflare Dashboard → Pages → {{SITE_NAME}}**
2. **Settings → Delete project**

This removes the deployment and frees the `{{SITE_NAME}}.pages.dev` name. It cannot be undone — the live site and its deployment history are gone. Your local files in this repo are unaffected.
```

- [ ] **Step 2: Replace the section**

Replace the entire `## Remove this site` section with:

```markdown
## Remove this site

Run `/teardown {{SITE_NAME}}` to delete the Cloudflare Pages project and take
the site offline. This is permanent — the live site and all deployment history
are gone. Your local files in `sites/{{SITE_NAME}}/` are unaffected.

To also delete local files: `/teardown {{SITE_NAME}} clean`
```

- [ ] **Step 3: Run full test suite**

```bash
bash scripts/test/run-tests.sh 2>&1
```

Expected: 19 passed, 0 failed.

- [ ] **Step 4: Verify command file present**

```bash
ls .claude/commands/
```

Expected output includes `teardown.md`.

- [ ] **Step 5: Commit and push**

```bash
git add scripts/templates/NEXT-STEPS.template.md
git commit -m "docs: update NEXT-STEPS to reference /teardown"
git push
```

---

## Manual Test Checklist

Run after the automated suite, against a real deployed site:

- [ ] `/teardown <site>` shows correct summary (slug, URL, custom domain if applicable)
- [ ] Wrong confirmation text → "Confirmation didn't match — teardown cancelled." and stops
- [ ] Correct confirmation → project deleted, site goes offline
- [ ] `/teardown <site> clean` → project deleted + `sites/<site>/` removed
- [ ] `/teardown` with no site name → prompts and stops
- [ ] `/teardown <site>` on a site with no `meta.deployed_url` → "Warning: No recorded deployment URL" then proceeds
