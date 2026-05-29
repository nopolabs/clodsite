# Per-Site Deploy Output Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `.deploy-output`, `.deploy-error`, and `.deploy-exit` from the shared `scripts/` directory into each site's own `sites/<name>/` directory so that deploy state is per-site and independent.

**Architecture:** Three files written by `deploy.sh` and read by `deploy-finalize.sh` are re-routed to `${SITE_DIR}/` using the already-available `$SITE_DIR` env var. The `deploy.md` command file and `.gitignore` are updated to match.

**Tech Stack:** Bash, git

---

### Task 1: Add deploy-finalize tests (TDD baseline)

Tests for `deploy-finalize.sh` don't exist yet. Add them before changing anything so they fail against the old paths and pass after the fix.

**Files:**
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Add deploy-finalize section to run-tests.sh**

Open `scripts/test/run-tests.sh`. After the `teardown.sh` section (line ~159) and before the `Results` block, insert:

```bash
# ── deploy-finalize.sh ────────────────────────────────────────────────────────
echo ""
echo "=== deploy-finalize.sh ==="

# Missing .deploy-output → exits 1
rm -f "${SITE_DIR}/.deploy-output"
bash scripts/deploy-finalize.sh > /dev/null 2>&1; assert_exit "missing .deploy-output exits 1" 1 $?

# Valid .deploy-output → exits 0, writes NEXT-STEPS.md
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
echo "https://abc12345.nopo-labs.pages.dev" > "${SITE_DIR}/.deploy-output"
bash scripts/deploy-finalize.sh > /dev/null 2>&1; assert_exit "finalize with output exits 0" 0 $?
assert_file_exists "NEXT-STEPS.md created" "${SITE_DIR}/NEXT-STEPS.md"
```

- [ ] **Step 2: Run tests and confirm the new cases fail**

```bash
bash scripts/test/run-tests.sh
```

Expected: all existing tests pass; the two new `deploy-finalize.sh` tests fail because `deploy-finalize.sh` still reads `scripts/.deploy-output` (which doesn't exist in the temp `$SITE_DIR`).

---

### Task 2: Update deploy.sh

**Files:**
- Modify: `scripts/deploy.sh`

- [ ] **Step 1: Replace the three output file paths**

In `scripts/deploy.sh`, find the block at the bottom (lines 81–88):

```bash
mkdir -p scripts

wrangler pages deploy "${SITE_DIR}/dist" --project-name "$SITE_NAME" \
  > scripts/.deploy-output 2> scripts/.deploy-error
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > scripts/.deploy-exit
exit $WRANGLER_EXIT
```

Replace it with:

```bash
wrangler pages deploy "${SITE_DIR}/dist" --project-name "$SITE_NAME" \
  > "${SITE_DIR}/.deploy-output" 2> "${SITE_DIR}/.deploy-error"
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > "${SITE_DIR}/.deploy-exit"
exit $WRANGLER_EXIT
```

(The `mkdir -p scripts` line is removed — `$SITE_DIR` already exists by this point in the flow.)

- [ ] **Step 2: Verify no remaining references to scripts/.deploy-***

```bash
grep -n "scripts/\.deploy" scripts/deploy.sh
```

Expected: no output.

---

### Task 3: Update deploy-finalize.sh

**Files:**
- Modify: `scripts/deploy-finalize.sh`

- [ ] **Step 1: Replace the two output file references**

In `scripts/deploy-finalize.sh`, find lines 6 and 17:

```bash
if [ ! -f "scripts/.deploy-output" ]; then
  echo "Error: No deployment output found. Run /deploy first."
  exit 1
fi
```

and

```bash
BUILD_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.pages\.dev' scripts/.deploy-output | tail -1)
```

Replace with:

```bash
if [ ! -f "${SITE_DIR}/.deploy-output" ]; then
  echo "Error: No deployment output found. Run /deploy first."
  exit 1
fi
```

and

```bash
BUILD_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.pages\.dev' "${SITE_DIR}/.deploy-output" | tail -1)
```

- [ ] **Step 2: Verify no remaining references to scripts/.deploy-***

```bash
grep -n "scripts/\.deploy" scripts/deploy-finalize.sh
```

Expected: no output.

- [ ] **Step 3: Run tests — new cases should now pass**

```bash
bash scripts/test/run-tests.sh
```

Expected: all tests pass, including the two new `deploy-finalize.sh` cases.

- [ ] **Step 4: Commit tasks 1–3**

```bash
git add scripts/deploy.sh scripts/deploy-finalize.sh scripts/test/run-tests.sh
git commit -m "fix: write deploy output files to sites/<name>/ instead of scripts/"
```

---

### Task 4: Update deploy.md command file

**Files:**
- Modify: `.claude/commands/deploy.md`

- [ ] **Step 1: Update the error-path reference**

In `.claude/commands/deploy.md`, find the error-interpretation block:

```
**[LLM]** Read `scripts/.deploy-error`. Interpret the error and explain clearly:
```

Replace with:

```
**[LLM]** Read `sites/<site-name>/.deploy-error`. Interpret the error and explain clearly:
```

- [ ] **Step 2: Verify no remaining references to scripts/.deploy-***

```bash
grep -n "scripts/\.deploy" .claude/commands/deploy.md
```

Expected: no output.

---

### Task 5: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Replace the three scripts/.deploy-* entries**

In `.gitignore`, find:

```
# Cloudflare deploy artifacts
scripts/.deploy-output
scripts/.deploy-error
scripts/.deploy-exit
```

Replace with:

```
# Cloudflare deploy artifacts
sites/*/.deploy-*
```

- [ ] **Step 2: Verify the old entries are gone and new pattern is present**

```bash
grep -n "deploy" .gitignore
```

Expected output:
```
<line#>:# Cloudflare deploy artifacts
<line#>:sites/*/.deploy-*
```

- [ ] **Step 3: Commit tasks 4–5**

```bash
git add .claude/commands/deploy.md .gitignore
git commit -m "fix: update deploy.md and .gitignore for per-site deploy output paths"
```

---

### Task 6: Update ROADMAP.md

Mark the item as shipped.

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark the Per-site deploy output files section as done**

In `ROADMAP.md`, find the `## Per-site deploy output files` section. Add a note at the top of that section's body:

```
Shipped May 2026. Deploy output files now live at `sites/<name>/.deploy-*`.
```

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark per-site deploy output files as shipped"
```
