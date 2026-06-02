# `resend-form` Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `resend-form` catalog component that backs a contact form with a Cloudflare Pages Function calling the Resend API, with `to`/`from`/`subject` baked in at build time and `RESEND_API_KEY` pushed from `.env` to Pages secrets at deploy time.

**Architecture:** New component in `components/resend-form/` (schema, Nunjucks template, CSS, Pages Function template). New `scripts/render-functions.sh` reads `build-plan.yaml`, finds `resend-form` components, substitutes `{{TO}}`/`{{FROM}}`/`{{SUBJECT}}` into `function.template.js`, and writes `sites/<name>/functions/api/contact.js`. `deploy.sh` gains `--functions-dir` flag and a `RESEND_API_KEY` secret push when `functions/` exists.

**Tech Stack:** Bash + Node 20 + `js-yaml` (existing), Cloudflare Pages Functions (ES module syntax), Resend REST API (raw `fetch`, no SDK).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `scripts/test/fixtures/valid-build-plan-resend.yaml` | Create | Test fixture with a valid `resend-form` component |
| `scripts/test/run-tests.sh` | Modify | Add validate-plan + render-functions tests |
| `components/resend-form/schema.json` | Create | Field definitions for validate-plan.sh + get_schema MCP tool |
| `components/resend-form/component.njk` | Create | Form HTML + inline fetch JS with submitting/success/error states |
| `components/resend-form/component.css` | Create | Form styles |
| `components/resend-form/function.template.js` | Create | Pages Function source with `{{TO}}`, `{{FROM}}`, `{{SUBJECT}}` placeholders |
| `scripts/render-functions.sh` | Create | Build step: substitute placeholders → `sites/<name>/functions/api/contact.js` |
| `scripts/deploy.sh` | Modify | Add `--functions-dir` flag + `RESEND_API_KEY` secret push |
| `CLAUDE.md` | Modify | Add `render-functions.sh` to `/build` step list |

---

### Task 1: Test fixture + schema + validate-plan tests

**Files:**
- Create: `scripts/test/fixtures/valid-build-plan-resend.yaml`
- Create: `components/resend-form/schema.json`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Create the test fixture**

Create `scripts/test/fixtures/valid-build-plan-resend.yaml`:

```yaml
slug: resend-test
name: Resend Test
overview: Fixture for render-functions.sh tests.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
    components:
      - type: prose
        markdown: |
          ## Hello
          A paragraph.
  - id: contact
    title: Contact
    components:
      - type: resend-form
        to: hello@example.com
        from: noreply@example.com
        subject: Message from resend-test
        submit_label: Send
        success_message: Thanks, we will be in touch.
        fields:
          - { name: name,    label: Your name, type: text,     required: true }
          - { name: email,   label: Email,     type: email,    required: true }
          - { name: message, label: Message,   type: textarea, required: true }
nav:
  order: [home, contact]
contact:
  enabled: false
```

- [ ] **Step 2: Add failing tests to run-tests.sh**

In `scripts/test/run-tests.sh`, find the line:

```bash
cp scripts/test/fixtures/valid-build-plan-components.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "valid component plan exits 0" 0 $?
```

Append directly after it:

```bash
# resend-form: valid plan passes
cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "valid resend-form plan passes" 0 $?

# resend-form: missing `from` field → exits 1
printf '%s\n' 'slug: test
name: Test
overview: Test.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
    components:
      - type: resend-form
        to: hello@example.com
        fields:
          - { name: name, label: Name, type: text, required: true }
nav:
  order: [home]
contact:
  enabled: false' > "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "resend-form missing from exits 1" 1 $?

# resend-form: missing `to` field → exits 1
printf '%s\n' 'slug: test
name: Test
overview: Test.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
    components:
      - type: resend-form
        from: noreply@example.com
        fields:
          - { name: name, label: Name, type: text, required: true }
nav:
  order: [home]
contact:
  enabled: false' > "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "resend-form missing to exits 1" 1 $?
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "resend"
```

Expected: `✗ valid resend-form plan passes` — `resend-form` is not yet a known component type.

- [ ] **Step 4: Create `components/resend-form/schema.json`**

Create `components/resend-form/schema.json`:

```json
{
  "description": "Contact form with server-side email delivery via Resend. Requires RESEND_API_KEY in .env and a Resend-verified sender address in the 'from' field.",
  "required": {
    "to": "string",
    "from": "string",
    "fields": "array"
  },
  "optional": {
    "subject": "string",
    "submit_label": "string",
    "success_message": "string"
  },
  "example": "type: resend-form\nto: hello@example.com\nfrom: noreply@example.com    # must be a Resend-verified address\nsubject: Message from my-site  # optional\nsubmit_label: Send             # optional, default: Send\nsuccess_message: Thanks, we will be in touch.  # optional\nfields:                        # at least one required\n  - { name: name,    label: Your name,  type: text,     required: true }\n  - { name: email,   label: Your email, type: email,    required: true }\n  - { name: message, label: Message,    type: textarea, required: true }\n"
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "resend|Results"
```

Expected: `✓ valid resend-form plan passes`, `✓ resend-form missing from exits 1`, `✓ resend-form missing to exits 1`, and `Results: N passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add scripts/test/fixtures/valid-build-plan-resend.yaml \
        scripts/test/run-tests.sh \
        components/resend-form/schema.json
git commit -m "feat(resend-form): schema + validate-plan tests"
```

---

### Task 2: Component HTML and CSS

**Files:**
- Create: `components/resend-form/component.njk`
- Create: `components/resend-form/component.css`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Add failing test for render-templates.sh**

In `scripts/test/run-tests.sh`, find the line:

```bash
assert_contains "gallery includes gallery type"   "gallery/component.njk" "$GAL"
```

Append directly after it:

```bash
# render-templates.sh: resend-form page includes component
cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/src"
bash scripts/render-templates.sh > /dev/null 2>&1
assert_exit "render-templates with resend-form exits 0" 0 $?
assert_file_exists "contact page rendered" "${SITE_DIR}/src/contact.njk"
CONTACT=$(cat "${SITE_DIR}/src/contact.njk")
assert_contains "contact includes resend-form component" "resend-form/component.njk" "$CONTACT"
assert_contains "contact permalink"                      "permalink: /contact/"       "$CONTACT"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "resend-form component|Results"
```

Expected: `✗ contact includes resend-form component` — `component.njk` does not exist yet.

- [ ] **Step 3: Create `components/resend-form/component.njk`**

Create `components/resend-form/component.njk`:

```html
{% set successMsg = component.success_message or "Thanks, we will be in touch." %}
<div class="c-resend-form">
  <form class="c-resend-form__form">
    {% for field in component.fields %}
    <div class="c-resend-form__field">
      <label for="rf-{{ field.name }}">{{ field.label }}{% if field.required %} <span class="c-resend-form__required">*</span>{% endif %}</label>
      {% if field.type == 'textarea' %}
      <textarea id="rf-{{ field.name }}" name="{{ field.name }}"{% if field.required %} required{% endif %}></textarea>
      {% else %}
      <input id="rf-{{ field.name }}" name="{{ field.name }}" type="{{ field.type }}"{% if field.required %} required{% endif %}>
      {% endif %}
    </div>
    {% endfor %}
    <button type="submit" class="c-resend-form__submit">{{ component.submit_label or "Send" }}</button>
    <p class="c-resend-form__error" hidden>Something went wrong — please try again.</p>
  </form>
  <p class="c-resend-form__success" hidden>{{ successMsg }}</p>
  <script>
    (function(){
      var wrapper = document.currentScript.closest('.c-resend-form');
      var form = wrapper.querySelector('form');
      var btn = form.querySelector('.c-resend-form__submit');
      var errorEl = form.querySelector('.c-resend-form__error');
      var successEl = wrapper.querySelector('.c-resend-form__success');
      form.addEventListener('submit', async function(e){
        e.preventDefault();
        btn.disabled = true;
        btn.textContent = 'Sending…';
        errorEl.hidden = true;
        var data = {};
        for (var el of form.elements) { if (el.name) data[el.name] = el.value; }
        try {
          var res = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          if (res.ok) {
            form.hidden = true;
            successEl.hidden = false;
          } else { throw new Error(); }
        } catch(err) {
          errorEl.hidden = false;
          btn.disabled = false;
          btn.textContent = '{{ component.submit_label or "Send" }}';
        }
      });
    })();
  </script>
</div>
```

- [ ] **Step 4: Create `components/resend-form/component.css`**

Create `components/resend-form/component.css`:

```css
.c-resend-form {
  max-width: 480px;
}
.c-resend-form__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.c-resend-form__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.c-resend-form__field label {
  font-weight: 600;
  font-size: 0.95rem;
}
.c-resend-form__field input,
.c-resend-form__field textarea {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font: inherit;
  font-size: 1rem;
}
.c-resend-form__field textarea {
  min-height: 6rem;
  resize: vertical;
}
.c-resend-form__required {
  color: #c00;
}
.c-resend-form__submit {
  align-self: flex-start;
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 4px;
  background: #222;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.c-resend-form__submit:hover:not(:disabled) {
  background: #444;
}
.c-resend-form__submit:disabled {
  opacity: 0.6;
  cursor: default;
}
.c-resend-form__error {
  margin: 0;
  color: #c00;
  font-size: 0.9rem;
}
.c-resend-form__success {
  margin: 0;
  font-weight: 600;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "resend|Results"
```

Expected: all resend assertions pass, `Results: N passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add components/resend-form/component.njk \
        components/resend-form/component.css \
        scripts/test/run-tests.sh
git commit -m "feat(resend-form): component template and styles"
```

---

### Task 3: Pages Function template

**Files:**
- Create: `components/resend-form/function.template.js`

No automated test at this stage — correctness is verified by render-functions.sh tests in Task 4, which substitute the placeholders and check the output.

- [ ] **Step 1: Create `components/resend-form/function.template.js`**

Create `components/resend-form/function.template.js`:

```javascript
export async function onRequestPost(context) {
  const { RESEND_API_KEY } = context.env;
  if (!RESEND_API_KEY) {
    return Response.json({ ok: false, error: 'Not configured' }, { status: 500 });
  }

  let data;
  try { data = await context.request.json(); }
  catch { return Response.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }

  const body = Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      to:      ['{{TO}}'],
      from:    '{{FROM}}',
      subject: '{{SUBJECT}}',
      text:    body,
    }),
  });

  return res.ok
    ? Response.json({ ok: true })
    : Response.json({ ok: false, error: 'Email delivery failed' }, { status: 502 });
}
```

- [ ] **Step 2: Commit**

```bash
git add components/resend-form/function.template.js
git commit -m "feat(resend-form): Pages Function template"
```

---

### Task 4: render-functions.sh

**Files:**
- Create: `scripts/render-functions.sh`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Add failing tests to run-tests.sh**

In `scripts/test/run-tests.sh`, find the line:

```bash
# ── Results ───────────────────────────────────────────────────────────────────
```

Insert a new section immediately before it:

```bash
# ── render-functions.sh ───────────────────────────────────────────────────────
echo ""
echo "=== render-functions.sh ==="

# No resend-form in plan → exits 0, functions/ NOT created
cp scripts/test/fixtures/valid-build-plan-components.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/functions"
bash scripts/render-functions.sh > /dev/null 2>&1; assert_exit "no resend-form → exits 0" 0 $?
if [ ! -d "${SITE_DIR}/functions" ]; then
  echo "  ✓ no resend-form → functions/ not created"
  PASS=$((PASS + 1))
else
  echo "  ✗ no resend-form → functions/ was unexpectedly created"
  FAIL=$((FAIL + 1))
fi

# resend-form found → creates functions/api/contact.js with substituted values
cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/functions"
bash scripts/render-functions.sh > /dev/null 2>&1; assert_exit "resend-form → exits 0" 0 $?
assert_file_exists "functions/api/contact.js created" "${SITE_DIR}/functions/api/contact.js"
FUNC=$(cat "${SITE_DIR}/functions/api/contact.js")
assert_contains "to address substituted"   "hello@example.com"      "$FUNC"
assert_contains "from address substituted" "noreply@example.com"    "$FUNC"
assert_contains "subject substituted"      "Message from resend-test" "$FUNC"
assert_contains "function has handler"     "onRequestPost"           "$FUNC"
if ! echo "$FUNC" | grep -qF "{{TO}}" && ! echo "$FUNC" | grep -qF "{{FROM}}" && ! echo "$FUNC" | grep -qF "{{SUBJECT}}"; then
  echo "  ✓ no raw placeholders remain in output"
  PASS=$((PASS + 1))
else
  echo "  ✗ raw placeholders remain in output"
  FAIL=$((FAIL + 1))
fi
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "render-functions|Results"
```

Expected: `✗ resend-form → exits 0` — `render-functions.sh` does not exist yet.

- [ ] **Step 3: Create `scripts/render-functions.sh`**

Create `scripts/render-functions.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
PLAN="${SITE_DIR}/build-plan.yaml"
COMPONENTS_DIR="${COMPONENTS_DIR:-components}"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan first."
  exit 1
fi

node -e "
const yaml = require('js-yaml');
const fs   = require('fs');
const path = require('path');

const plan          = yaml.load(fs.readFileSync('${PLAN}', 'utf8'));
const componentsDir = '${COMPONENTS_DIR}';
const siteDir       = '${SITE_DIR}';

let found = null;
for (const page of (plan.pages || [])) {
  for (const comp of (page.components || [])) {
    if (comp.type === 'resend-form') { found = comp; break; }
  }
  if (found) break;
}

if (!found) process.exit(0);

const template = path.join(componentsDir, 'resend-form', 'function.template.js');
if (!fs.existsSync(template)) {
  console.error('Error: ' + template + ' not found.');
  process.exit(1);
}

let src = fs.readFileSync(template, 'utf8');
src = src.replace(/\{\{TO\}\}/g,      found.to      || '');
src = src.replace(/\{\{FROM\}\}/g,    found.from    || '');
src = src.replace(/\{\{SUBJECT\}\}/g, found.subject || '');

const outDir = path.join(siteDir, 'functions', 'api');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'contact.js'), src);
console.log('✓ Rendered functions/api/contact.js (to: ' + (found.to || '') + ')');
"
```

- [ ] **Step 4: Make the script executable**

```bash
chmod +x scripts/render-functions.sh
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "render-functions|Results"
```

Expected: all render-functions assertions pass, `Results: N passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add scripts/render-functions.sh scripts/test/run-tests.sh
git commit -m "feat(resend-form): render-functions.sh build step"
```

---

### Task 5: deploy.sh — --functions-dir and RESEND_API_KEY secret

**Files:**
- Modify: `scripts/deploy.sh`

No automated tests — `deploy.sh` requires live Cloudflare credentials. Manual smoke test instructions are at the end of this task.

- [ ] **Step 1: Read the current deploy.sh wrangler invocation**

The current lines 75–83 in `scripts/deploy.sh` look like:

```bash
echo "Deploying '$SITE_NAME' to Cloudflare Pages..."
echo ""

wrangler pages deploy "${SITE_DIR}/dist" --project-name "$SITE_NAME" \
  > "${SITE_DIR}/.deploy-output" 2> "${SITE_DIR}/.deploy-error"
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > "${SITE_DIR}/.deploy-exit"
exit $WRANGLER_EXIT
```

- [ ] **Step 2: Replace those lines with the updated version**

Replace the block starting at `echo "Deploying '$SITE_NAME' to Cloudflare Pages..."` through `exit $WRANGLER_EXIT` with:

```bash
# Push RESEND_API_KEY as a Pages secret when the site uses resend-form
if [ -d "${SITE_DIR}/functions" ] && [ -n "${RESEND_API_KEY:-}" ]; then
  echo "Setting RESEND_API_KEY secret for '$SITE_NAME'..."
  echo "$RESEND_API_KEY" | wrangler pages secret put RESEND_API_KEY \
    --project-name "$SITE_NAME" 2>/dev/null || true
  echo ""
fi

echo "Deploying '$SITE_NAME' to Cloudflare Pages..."
echo ""

FUNCTIONS_ARGS=""
if [ -d "${SITE_DIR}/functions" ]; then
  FUNCTIONS_ARGS="--functions-dir ${SITE_DIR}/functions"
fi

# shellcheck disable=SC2086
wrangler pages deploy "${SITE_DIR}/dist" --project-name "$SITE_NAME" \
  $FUNCTIONS_ARGS \
  > "${SITE_DIR}/.deploy-output" 2> "${SITE_DIR}/.deploy-error"
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > "${SITE_DIR}/.deploy-exit"
exit $WRANGLER_EXIT
```

- [ ] **Step 3: Verify the script is syntactically valid**

```bash
bash -n scripts/deploy.sh
```

Expected: no output (no syntax errors).

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy.sh
git commit -m "feat(resend-form): deploy with --functions-dir and RESEND_API_KEY secret"
```

- [ ] **Step 5: Manual smoke test (requires Cloudflare + Resend credentials)**

Add a `resend-form` component to an existing test site's `build-plan.yaml`. Ensure `RESEND_API_KEY=re_...` is in `.env`. Then:

```bash
SITE_DIR=sites/<site-name> bash scripts/render-functions.sh
ls sites/<site-name>/functions/api/contact.js   # should exist
SITE_DIR=sites/<site-name> bash scripts/build-site.sh
SITE_DIR=sites/<site-name> bash scripts/deploy.sh
```

Expected: deploy output includes `Setting RESEND_API_KEY secret`, wrangler deploy succeeds, live URL returned. Submit the form and verify email arrives.

---

### Task 6: CLAUDE.md — add render-functions.sh to /build steps

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the /build command steps in CLAUDE.md**

Find the `/build` command section. The current steps are:

```
[SCRIPT] bash scripts/validate-plan.sh
[SCRIPT] bash scripts/write-site-json.sh
[SCRIPT] bash scripts/apply-theme.sh
[SCRIPT] bash scripts/render-templates.sh
[SCRIPT] bash scripts/build-site.sh
```

Replace with:

```
[SCRIPT] bash scripts/validate-plan.sh
[SCRIPT] bash scripts/write-site-json.sh
[SCRIPT] bash scripts/apply-theme.sh
[SCRIPT] bash scripts/render-templates.sh
[SCRIPT] bash scripts/render-functions.sh
[SCRIPT] bash scripts/build-site.sh
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): add render-functions.sh to /build steps"
```