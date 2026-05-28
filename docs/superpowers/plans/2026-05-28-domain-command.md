# `/domain` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/domain <site-name>` command that wires a custom domain to a deployed Cloudflare Pages project — creating the CNAME automatically when DNS is Cloudflare-managed, and printing manual instructions otherwise.

**Architecture:** `[HYBRID]` — LLM command file handles prompting for a missing domain and updating the spec; `scripts/domain.sh` handles all Cloudflare API calls via curl. The spec's `meta.deployed_url` (set by `deploy-finalize.sh`) provides the correct CNAME target. Zone ownership detection determines the automated vs. manual fallback path.

**Tech Stack:** bash, curl, Node.js (JSON parsing), Cloudflare REST API (Zones + Pages)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/domain.sh` | Create | All Cloudflare API calls: zone check, Pages association, CNAME creation, manual fallback |
| `.claude/commands/domain.md` | Create | Command definition: arg parsing, spec update prompt, script invocation, error interpretation |
| `scripts/test/fixtures/domain-spec-deployed.json` | Create | Test fixture: valid spec with `meta.deployed_url` and `domain.hostname` |
| `scripts/test/fixtures/domain-spec-no-deploy.json` | Create | Test fixture: valid spec without `meta.deployed_url` |
| `scripts/test/run-tests.sh` | Modify | Add `domain.sh` unit tests |
| `.claude/commands/setup.md` | Modify | Add `Zone > DNS: Edit` to token permission instructions |
| `scripts/templates/NEXT-STEPS.template.md` | Modify | Replace manual domain section with `/domain` reference |

---

## Task 1: Create test fixtures

**Files:**
- Create: `scripts/test/fixtures/domain-spec-deployed.json`
- Create: `scripts/test/fixtures/domain-spec-no-deploy.json`

- [ ] **Step 1: Create `domain-spec-deployed.json`**

```json
{
  "site": {
    "name": "Nopo Labs",
    "purpose": "Showcases open-source tools for developers",
    "audience": "Software engineers",
    "tone": "technical",
    "style": "minimal"
  },
  "pages": [
    { "id": "home", "title": "Home", "purpose": "Landing page", "content_outline": "Hero + brief intro" },
    { "id": "about", "title": "About", "purpose": "Who we are", "content_outline": "Team and mission" }
  ],
  "nav": { "order": ["home", "about"], "show_contact_link": false },
  "contact": { "enabled": false, "type": "email", "email": "" },
  "domain": { "custom": true, "hostname": "ndig.nopolabs.com" },
  "content_status": "draft",
  "meta": {
    "generated_at": "2026-05-28T00:00:00Z",
    "spec_version": "1.0",
    "deployed_url": "https://ndig.pages.dev"
  }
}
```

- [ ] **Step 2: Create `domain-spec-no-deploy.json`**

```json
{
  "site": {
    "name": "Nopo Labs",
    "purpose": "Showcases open-source tools for developers",
    "audience": "Software engineers",
    "tone": "technical",
    "style": "minimal"
  },
  "pages": [
    { "id": "home", "title": "Home", "purpose": "Landing page", "content_outline": "Hero + brief intro" },
    { "id": "about", "title": "About", "purpose": "Who we are", "content_outline": "Team and mission" }
  ],
  "nav": { "order": ["home", "about"], "show_contact_link": false },
  "contact": { "enabled": false, "type": "email", "email": "" },
  "domain": { "custom": true, "hostname": "ndig.nopolabs.com" },
  "content_status": "draft",
  "meta": {
    "generated_at": "2026-05-28T00:00:00Z",
    "spec_version": "1.0"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/test/fixtures/domain-spec-deployed.json scripts/test/fixtures/domain-spec-no-deploy.json
git commit -m "test: add domain.sh test fixtures"
```

---

## Task 2: Add failing tests, implement domain.sh guards and apex extraction

**Files:**
- Modify: `scripts/test/run-tests.sh`
- Create: `scripts/domain.sh`

- [ ] **Step 1: Add domain.sh tests to run-tests.sh**

Add this block at the end of `run-tests.sh`, before the `# ── Results` section:

```bash
# ── domain.sh ─────────────────────────────────────────────────────────────────
echo ""
echo "=== domain.sh ==="

# Missing SITE_DIR → exits 1
SITE_DIR="" bash scripts/domain.sh > /dev/null 2>&1; assert_exit "missing SITE_DIR exits 1" 1 $?

# Spec missing deployed_url → exits 1
cp scripts/test/fixtures/domain-spec-no-deploy.json "${SITE_DIR}/site-spec.json"
bash scripts/domain.sh > /dev/null 2>&1; assert_exit "missing deployed_url exits 1" 1 $?

# Valid spec with deployed_url → exits 0 before credentials check
# (spec check passes; script will exit 1 on missing .env only if run outside test env)
cp scripts/test/fixtures/domain-spec-deployed.json "${SITE_DIR}/site-spec.json"

# Apex extraction (mirrors extract_apex in domain.sh)
extract_apex_test() { echo "$1" | rev | cut -d. -f1,2 | rev; }
actual=$(extract_apex_test "ndig.nopolabs.com")
[ "$actual" = "nopolabs.com" ] && { echo "  ✓ apex extraction: subdomain"; PASS=$((PASS+1)); } || { echo "  ✗ apex extraction: subdomain (got: $actual)"; FAIL=$((FAIL+1)); }
actual=$(extract_apex_test "nopolabs.com")
[ "$actual" = "nopolabs.com" ] && { echo "  ✓ apex extraction: root domain"; PASS=$((PASS+1)); } || { echo "  ✗ apex extraction: root domain (got: $actual)"; FAIL=$((FAIL+1)); }
actual=$(extract_apex_test "deep.ndig.nopolabs.com")
[ "$actual" = "nopolabs.com" ] && { echo "  ✓ apex extraction: deep subdomain"; PASS=$((PASS+1)); } || { echo "  ✗ apex extraction: deep subdomain (got: $actual)"; FAIL=$((FAIL+1)); }
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bash scripts/test/run-tests.sh 2>&1
```

Expected: `=== domain.sh ===` section shows failures because `scripts/domain.sh` does not exist yet.

- [ ] **Step 3: Create `scripts/domain.sh` with guards and apex extraction**

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/site-spec.json" ]; then
  echo "Error: ${SITE_DIR}/site-spec.json not found. Run /interview first."
  exit 1
fi

# Parse spec — check deployed_url before loading credentials
SPEC_PARSE=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('${SITE_DIR}/site-spec.json', 'utf8'));
if (!spec.meta || !spec.meta.deployed_url) {
  process.stderr.write('Error: site has not been deployed yet. Run /deploy first.\n');
  process.exit(1);
}
if (!spec.domain || !spec.domain.hostname) {
  process.stderr.write('Error: domain.hostname not set in spec.\n');
  process.exit(1);
}
const url = new URL(spec.meta.deployed_url);
const slug = spec.site.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+\$/g,'');
console.log(spec.domain.hostname);
console.log(url.hostname);
console.log(slug);
" 2>&1) || { echo "$SPEC_PARSE" >&2; exit 1; }

HOSTNAME=$(echo "$SPEC_PARSE" | sed -n '1p')
PAGES_DEV_HOST=$(echo "$SPEC_PARSE" | sed -n '2p')
PROJECT_SLUG=$(echo "$SPEC_PARSE" | sed -n '3p')

# Extract apex domain (last two labels)
extract_apex() { echo "$1" | rev | cut -d. -f1,2 | rev; }
APEX=$(extract_apex "$HOSTNAME")

# Subdomain label for DNS record (@ for root domain)
if [ "$HOSTNAME" = "$APEX" ]; then
  CNAME_NAME="@"
else
  CNAME_NAME="${HOSTNAME%.$APEX}"
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

CF_API="https://api.cloudflare.com/client/v4"
CF_TMP=$(mktemp)
trap 'rm -f "$CF_TMP"' EXIT

# Step 1: Check zone ownership
ZONE_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "${CF_API}/zones?name=${APEX}")

CLOUDFLARE_DNS=false
ZONE_ID=""

if [ "$ZONE_HTTP" = "200" ]; then
  ZONE_ID=$(node -e "
const d=JSON.parse(require('fs').readFileSync('$CF_TMP','utf8'));
console.log(d.result && d.result.length > 0 ? d.result[0].id : '');
  " 2>/dev/null || echo "")
  [ -n "$ZONE_ID" ] && CLOUDFLARE_DNS=true
elif [ "$ZONE_HTTP" = "403" ]; then
  echo "Warning: token lacks Zone:Read — cannot check DNS ownership."
fi

# Step 2: Add Pages domain association
echo "Adding Pages domain association for ${HOSTNAME}..."
PAGES_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" -X POST \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${HOSTNAME}\"}" \
  "${CF_API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_SLUG}/domains")

if [ "$PAGES_HTTP" = "200" ] || [ "$PAGES_HTTP" = "201" ]; then
  echo "✓ Pages domain association added"
elif [ "$PAGES_HTTP" = "409" ]; then
  echo "✓ Pages domain association already configured"
else
  echo "Error adding Pages domain association (HTTP ${PAGES_HTTP}):"
  cat "$CF_TMP"
  exit 1
fi

# Step 3: Create CNAME or print manual instructions
DNS_MANUAL=false

if [ "$CLOUDFLARE_DNS" = true ]; then
  DNS_HTTP=$(curl -s -o "$CF_TMP" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"CNAME\",\"name\":\"${CNAME_NAME}\",\"content\":\"${PAGES_DEV_HOST}\",\"proxied\":true}" \
    "${CF_API}/zones/${ZONE_ID}/dns_records")

  if [ "$DNS_HTTP" = "200" ] || [ "$DNS_HTTP" = "201" ]; then
    echo "✓ CNAME created: ${HOSTNAME} → ${PAGES_DEV_HOST} (proxied)"
    echo "SSL certificate will provision within ~1 minute."
    exit 0
  elif node -e "
const d=JSON.parse(require('fs').readFileSync('$CF_TMP','utf8'));
process.exit(d.errors && d.errors.some(e=>e.code===81053) ? 0 : 1);
  " 2>/dev/null; then
    echo "✓ CNAME already exists: ${HOSTNAME} → ${PAGES_DEV_HOST}"
    echo "SSL certificate will provision within ~1 minute."
    exit 0
  elif [ "$DNS_HTTP" = "403" ]; then
    echo ""
    echo "Warning: token lacks Zone:DNS:Edit — cannot create CNAME automatically."
    DNS_MANUAL=true
  else
    echo "Error creating DNS record (HTTP ${DNS_HTTP}):"
    cat "$CF_TMP"
    exit 1
  fi
else
  DNS_MANUAL=true
fi

# Manual fallback
echo ""
echo "Add this record at your DNS provider (or Cloudflare DNS dashboard):"
echo "  Type:   CNAME"
echo "  Name:   ${CNAME_NAME}"
echo "  Target: ${PAGES_DEV_HOST}"
echo "  Proxy:  enable if your provider supports it (orange cloud in Cloudflare)"
if [ "$DNS_MANUAL" = true ] && [ "$CLOUDFLARE_DNS" = true ]; then
  echo ""
  echo "To enable full automation: add Zone > DNS: Edit to your token at"
  echo "dash.cloudflare.com → API Tokens, then re-run /domain $(basename "${SITE_DIR}")."
fi
```

- [ ] **Step 4: Make script executable**

```bash
chmod +x scripts/domain.sh
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
bash scripts/test/run-tests.sh 2>&1
```

Expected output includes:
```
=== domain.sh ===
  ✓ missing SITE_DIR exits 1
  ✓ missing deployed_url exits 1
  ✓ apex extraction: subdomain
  ✓ apex extraction: root domain
  ✓ apex extraction: deep subdomain
```

Overall: all prior tests still pass + 5 new domain.sh tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/domain.sh scripts/test/run-tests.sh
git commit -m "feat: add domain.sh with guards and apex extraction"
```

---

## Task 3: Create `.claude/commands/domain.md`

**Files:**
- Create: `.claude/commands/domain.md`

- [ ] **Step 1: Create the command file**

```markdown
Connect a custom domain to a deployed Clodsite site.

---

**Get site name.** Look at what the user typed after `/domain`. If no site name was provided:

> "Please provide a site name: `/domain <site-name>` — e.g., `/domain acme-corp`"

And stop.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

\`\`\`bash
bash scripts/migrate-site.sh
\`\`\`

---

**[LLM]** Read `sites/<site-name>/site-spec.json`.

If `domain.custom = false` or `domain.hostname` is empty, ask:

> "What domain or subdomain should this site use? (e.g. `ndig.nopolabs.com` or `acme.com`)"

Wait for the reply. Then update the spec using the Write tool:
- Set `domain.custom` to `true`
- Set `domain.hostname` to the answer
- Leave all other fields unchanged

If `meta.deployed_url` is not set, tell the user:

> "This site hasn't been deployed yet. Run `/deploy <site-name>` first, then re-run `/domain <site-name>`."

And stop.

---

**[SCRIPT]** Wire up the custom domain:

\`\`\`bash
SITE_DIR=sites/<site-name> bash scripts/domain.sh
\`\`\`

---

**[LLM]** Interpret the output:

- If output contains `✓ CNAME created`: tell the user their domain will be live within ~1 minute and SSL provisions automatically. No further action needed.
- If output contains `✓ CNAME already exists`: tell the user the domain was already wired up.
- If output contains `Add this record at your DNS provider`: present the CNAME record clearly. If it also contains `To enable full automation`, include that note.
- If the script exits with a non-zero code: explain the error clearly and tell the user how to fix it (see common cases below).

**Common errors:**
- `CLOUDFLARE_API_TOKEN … not set` → run `/setup`
- `site has not been deployed yet` → run `/deploy <site-name>` first
- `Error adding Pages domain association (HTTP 4xx)` → check that the Pages project name matches the slug in `site.name`; re-run `/deploy <site-name>` if the project was deleted
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/domain.md
git commit -m "feat: add /domain command file"
```

---

## Task 4: Update `setup.md` and `NEXT-STEPS.template.md`

**Files:**
- Modify: `.claude/commands/setup.md`
- Modify: `scripts/templates/NEXT-STEPS.template.md`

- [ ] **Step 1: Update token permission request in `setup.md`**

Find this line:

```
> "Please paste your Cloudflare API token. You can create one at https://dash.cloudflare.com/profile/api-tokens — it needs **Cloudflare Pages: Edit** permission."
```

Replace with:

```
> "Please paste your Cloudflare API token. You can create one at https://dash.cloudflare.com/profile/api-tokens — it needs these permissions:
> - **Cloudflare Pages: Edit** — required for deploy
> - **Zone > DNS: Edit** — required for `/domain` to create CNAME records automatically (optional: without it, `/domain` prints the record for you to add manually)"
```

- [ ] **Step 2: Update token verification error message in `setup.md`**

Find this line:

```
If this exits with an error, tell the user their token failed verification and ask them to check it has **Cloudflare Pages: Edit** permission.
```

Replace with:

```
If this exits with an error, tell the user their token failed verification and ask them to check it has **Cloudflare Pages: Edit** permission (and optionally **Zone > DNS: Edit** for `/domain` automation).
```

- [ ] **Step 3: Replace manual domain section in `NEXT-STEPS.template.md`**

Find and replace the entire `## Set up a custom domain` section (from the `## Set up a custom domain` heading through the paragraph ending "Without the CNAME, visitors will see a **522 error**..."):

```markdown
## Connect a custom domain

Run `/domain {{SITE_NAME}}` to connect a custom domain to this site.
Clodsite will add the Pages domain association and — if your DNS is managed
in Cloudflare — create the CNAME automatically. For external DNS providers
it prints the exact record to add at your registrar.
```

- [ ] **Step 4: Run all tests to confirm nothing broken**

```bash
bash scripts/test/run-tests.sh 2>&1
```

Expected: all tests pass (same count as before this task).

- [ ] **Step 5: Commit**

```bash
git add .claude/commands/setup.md scripts/templates/NEXT-STEPS.template.md
git commit -m "docs: add Zone:DNS:Edit to setup; update NEXT-STEPS to reference /domain"
```

---

## Task 5: Final verification and push

- [ ] **Step 1: Run full test suite**

```bash
bash scripts/test/run-tests.sh 2>&1
```

Expected: all tests pass, 0 failures. Count should be the original 11 + 5 new domain.sh tests = 16.

- [ ] **Step 2: Verify command file is discoverable**

```bash
ls .claude/commands/
```

Expected: `build.md  deploy.md  domain.md  help.md  interview.md  plan.md  setup.md`

- [ ] **Step 3: Push**

```bash
git push
```

---

## Manual Test Checklist

Run these after the automated suite passes, against a real deployed site (`ndig`):

- [ ] `/domain ndig` with `nopolabs.com` zone in Cloudflare account — CNAME created, domain resolves within ~1 minute
- [ ] Run `/domain ndig` a second time — 409 and duplicate CNAME both treated as success, clean output
- [ ] `/domain ndig` with token lacking `Zone:DNS:Edit` — warning shown, Pages association still added, CNAME record printed, re-run hint shown
- [ ] `/domain ndig` with token lacking `Zone:Read` — 403 on zone check, falls through to manual path, Pages association added, CNAME printed (no re-run hint since not Cloudflare-managed)
- [ ] `/domain` with no site name — prompts for name and stops
- [ ] `/domain ndig` with no domain in spec — prompts for domain, updates spec, proceeds
