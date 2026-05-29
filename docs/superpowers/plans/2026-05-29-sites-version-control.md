# Sites Version Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize `sites/` as a git repository during `/setup` and auto-commit after each successful `/deploy`.

**Architecture:** Add `--init-sites` mode to `setup.sh` (idempotent `git init` + `sites/.gitignore`); update `setup.md` to call it after `--verify` succeeds; add a guarded git commit block at the end of `deploy-finalize.sh` that only fires when `sites/.git` exists.

**Tech Stack:** Bash, git CLI

---

## File Map

| File | Change |
|------|--------|
| `scripts/setup.sh` | Add `--init-sites` mode |
| `.claude/commands/setup.md` | Call `--init-sites` after successful `--verify` |
| `scripts/deploy-finalize.sh` | Add git commit block after NEXT-STEPS.md is written |
| `scripts/test/run-tests.sh` | Add test sections for `--init-sites` and the new deploy-finalize behaviour |

---

## Task 1: Test `setup.sh --init-sites` (write failing tests first)

**Files:**
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Add a `setup.sh --init-sites` test section to `run-tests.sh`**

Insert this block just before the `# ── Results` section at the bottom of `run-tests.sh`:

```bash
# ── setup.sh --init-sites ─────────────────────────────────────────────────────
echo ""
echo "=== setup.sh --init-sites ==="

# Clean up any sites/ left from migration tests
rm -rf sites

# First run: creates sites/.git and sites/.gitignore
bash scripts/setup.sh --init-sites > /dev/null 2>&1; assert_exit "--init-sites exits 0" 0 $?
assert_dir_exists "sites/.git created" "sites/.git"
assert_file_exists "sites/.gitignore created" "sites/.gitignore"

# .gitignore content is correct
if grep -q "\*/src/" sites/.gitignore && grep -q "\*/dist/" sites/.gitignore && grep -q "\*/\.deploy-\*" sites/.gitignore; then
  echo "  ✓ sites/.gitignore has correct entries"
  PASS=$((PASS + 1))
else
  echo "  ✗ sites/.gitignore missing expected entries"
  FAIL=$((FAIL + 1))
fi

# Idempotent: second run doesn't fail
bash scripts/setup.sh --init-sites > /dev/null 2>&1; assert_exit "--init-sites is idempotent" 0 $?

# Idempotent: existing .gitignore is not overwritten
echo "custom content" > sites/.gitignore
bash scripts/setup.sh --init-sites > /dev/null 2>&1
if grep -q "custom content" sites/.gitignore; then
  echo "  ✓ existing sites/.gitignore not overwritten"
  PASS=$((PASS + 1))
else
  echo "  ✗ existing sites/.gitignore was overwritten"
  FAIL=$((FAIL + 1))
fi

rm -rf sites
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
bash scripts/test/run-tests.sh 2>&1 | tail -20
```

Expected: the new `--init-sites` assertions fail (the mode doesn't exist yet).

---

## Task 2: Implement `setup.sh --init-sites`

**Files:**
- Modify: `scripts/setup.sh`

- [ ] **Step 1: Add the `--init-sites` mode to `setup.sh`**

Insert this block immediately after the `--import` block (after line 40, before the `--check` block):

```bash
# ── --init-sites: initialize sites/ as a git repo ───────────────────────────
if [ "$MODE" = "--init-sites" ]; then
  mkdir -p sites
  git -C sites init -q
  if [ ! -f "sites/.gitignore" ]; then
    printf '*/src/\n*/dist/\n*/.deploy-*\n' > sites/.gitignore
    echo "✓ sites/.gitignore created."
  fi
  echo "✓ sites/ initialized as a git repository."
  exit 0
fi
```

- [ ] **Step 2: Run the tests to confirm they pass**

```bash
bash scripts/test/run-tests.sh 2>&1 | tail -20
```

Expected: all `--init-sites` assertions pass, full suite green.

- [ ] **Step 3: Commit**

```bash
git add scripts/setup.sh scripts/test/run-tests.sh
git commit -m "feat: add setup.sh --init-sites mode"
```

---

## Task 3: Update `setup.md` to call `--init-sites`

**Files:**
- Modify: `.claude/commands/setup.md`

- [ ] **Step 1: Add the `--init-sites` call after the final `--verify` success message**

Find this block at the end of `setup.md`:

```
**[SCRIPT]** Verify the token works:

```bash
bash scripts/setup.sh --verify
```

If this exits with an error, tell the user their token failed verification and ask them to check it has **Cloudflare Pages: Edit** permission (and optionally **Zone > DNS: Edit** for `/domain` automation).

When it succeeds, tell the user setup is complete and they can run `/interview <site-name>`.
```

Replace with:

```
**[SCRIPT]** Verify the token works:

```bash
bash scripts/setup.sh --verify
```

If this exits with an error, tell the user their token failed verification and ask them to check it has **Cloudflare Pages: Edit** permission (and optionally **Zone > DNS: Edit** for `/domain` automation).

**[SCRIPT]** Initialize the sites repository:

```bash
bash scripts/setup.sh --init-sites
```

When both succeed, tell the user setup is complete and they can run `/interview <site-name>`.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/setup.md
git commit -m "feat: call --init-sites from setup.md after verify"
```

---

## Task 4: Test `deploy-finalize.sh` git commit (write failing tests first)

**Files:**
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Add deploy-finalize git commit tests to `run-tests.sh`**

The existing deploy-finalize test block ends at:
```bash
assert_file_exists "NEXT-STEPS.md created" "${SITE_DIR}/NEXT-STEPS.md"
```

Add these cases immediately after that line:

```bash
# No sites/.git → git block is skipped, exits 0
rm -rf sites/.git
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
echo "https://abc12345.nopo-labs.pages.dev" > "${SITE_DIR}/.deploy-output"
bash scripts/deploy-finalize.sh > /dev/null 2>&1; assert_exit "finalize without sites/.git exits 0" 0 $?

# With sites/.git → commit is created
TEST_SITE_NAME="test-finalize-site"
SAVED_SITE_DIR="$SITE_DIR"
export SITE_DIR="sites/${TEST_SITE_NAME}"
mkdir -p "${SITE_DIR}"
git init -q sites
git -C sites config user.email "test@example.com"
git -C sites config user.name "Test"
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
echo "https://abc12345.nopo-labs.pages.dev" > "${SITE_DIR}/.deploy-output"
bash scripts/deploy-finalize.sh > /dev/null 2>&1; assert_exit "finalize with sites/.git exits 0" 0 $?
COMMIT_COUNT=$(git -C sites log --oneline 2>/dev/null | wc -l | tr -d ' ')
if [ "$COMMIT_COUNT" -ge 1 ]; then
  echo "  ✓ git commit created in sites/"
  PASS=$((PASS + 1))
else
  echo "  ✗ no git commit found in sites/"
  FAIL=$((FAIL + 1))
fi
COMMIT_MSG=$(git -C sites log --oneline -1 2>/dev/null | sed 's/^[a-f0-9]* //')
if echo "$COMMIT_MSG" | grep -q "^deploy:"; then
  echo "  ✓ commit message starts with 'deploy:'"
  PASS=$((PASS + 1))
else
  echo "  ✗ unexpected commit message: $COMMIT_MSG"
  FAIL=$((FAIL + 1))
fi
rm -rf sites
# Restore SITE_DIR for any tests that follow
export SITE_DIR="$SAVED_SITE_DIR"
```

- [ ] **Step 2: Run the tests to confirm the new cases fail**

```bash
bash scripts/test/run-tests.sh 2>&1 | tail -20
```

Expected: the two new `deploy-finalize` git commit assertions fail.

---

## Task 5: Implement git commit in `deploy-finalize.sh`

**Files:**
- Modify: `scripts/deploy-finalize.sh`

- [ ] **Step 1: Add the git commit block at the end of `deploy-finalize.sh`**

The current last two lines of `deploy-finalize.sh` are:
```bash
echo "See ${SITE_DIR}/NEXT-STEPS.md for next steps."
```

Add this block immediately after that line:

```bash
# Auto-commit to sites repo if initialised
SITE_DIR_NAME=$(basename "${SITE_DIR}")
if [ -d "sites/.git" ]; then
  git -C sites add "${SITE_DIR_NAME}/" 2>/dev/null || true
  git -C sites commit -m "deploy: ${SITE_DIR_NAME} → ${PROD_URL}" 2>/dev/null || true
fi
```

- [ ] **Step 2: Run the full test suite**

```bash
bash scripts/test/run-tests.sh
```

Expected: all tests pass including the new deploy-finalize git commit cases.

- [ ] **Step 3: Commit**

```bash
git add scripts/deploy-finalize.sh scripts/test/run-tests.sh
git commit -m "feat: auto-commit to sites/ git repo on deploy"
```

---

## Task 6: Update ROADMAP and push

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Move sites version control from Pending to Completed in `ROADMAP.md`**

Add to the Completed section:

```markdown
### Sites version control
Shipped May 2026. `/setup` initializes `sites/` as a git repository (idempotent).
`deploy-finalize.sh` auto-commits after each successful deploy with message
`deploy: <site-name> → <url>`. No remote management — add a remote and push manually.
```

Remove the configurable `sites/` location entry's note that says "Depends on sites-as-git-repo being in place first, which it will be." — replace with "Depends on sites version control (shipped May 2026)."

- [ ] **Step 2: Commit and push everything**

```bash
git add ROADMAP.md
git commit -m "docs: mark sites version control as shipped"
git push
```
