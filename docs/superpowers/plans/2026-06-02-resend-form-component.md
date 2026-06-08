# `resend-form` Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `resend-form` catalog component that backs a contact form with a Cloudflare Pages Function calling the Resend API, with `to`/`from`/`subject` baked in at build time and `RESEND_API_KEY` pushed from `.env` to Pages secrets at deploy time.

**Architecture:** New component in `components/resend-form/` (schema, Nunjucks template, CSS, Pages Function template). New `scripts/render-functions.sh` reads `build-plan.yaml`, finds `resend-form` components, serializes config (to, from, subject, fields as `[{ name, required, maxLength }]`) via `JSON.stringify` into `function.template.js`'s `{{CONFIG}}` placeholder, and writes `sites/<name>/functions/api/contact.js`. If no `resend-form` is found, only `functions/api/contact.js` (and empty parent directories) is removed — the rest of `functions/` is untouched. `deploy.sh` `cd`s into the site directory so Wrangler discovers `functions/` by convention, checks for `functions/api/contact.js` specifically before pushing `RESEND_API_KEY` as a Pages secret (aborting on failure). `deploy-finalize.sh` appends a bot-protection warning to `NEXT-STEPS.md` when `contact.js` is present. `mcp/pipeline.js` is also updated to include `render-functions.sh`.

**Tech Stack:** Bash + Node 20 + `js-yaml` (existing), Cloudflare Pages Functions (ES module syntax), Resend REST API (raw `fetch`, no SDK).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `scripts/test/fixtures/valid-build-plan-resend.yaml` | Create | Test fixture with a valid `resend-form` component |
| `scripts/test/run-tests.sh` | Modify | Add validate-plan + render-functions + deploy tests |
| `scripts/validate-plan.sh` | Modify | Add `items` and `min_items` descriptor support for array validation |
| `components/resend-form/schema.json` | Create | Field definitions for validate-plan.sh + get_schema MCP tool |
| `components/resend-form/component.njk` | Create | Form HTML + inline fetch JS with submitting/success/error states |
| `components/resend-form/component.css` | Create | Form styles |
| `components/resend-form/function.template.js` | Create | Pages Function source with a `{{CONFIG}}` placeholder replaced at build time with a JSON-serialized config object |
| `scripts/render-functions.sh` | Create | Build step: JSON-serialize config into `{{CONFIG}}` → `sites/<name>/functions/api/contact.js`; removes stale `functions/api/contact.js` (and empty parent dirs) when no resend-form found |
| `scripts/deploy.sh` | Modify | `cd` to site dir so Wrangler finds `functions/` by convention; `RESEND_API_KEY` secret push with error handling |
| `scripts/deploy-finalize.sh` | Modify | Append bot-protection warning section to `NEXT-STEPS.md` when `functions/api/contact.js` present |
| `mcp/pipeline.js` | Modify | Insert `render-functions.sh` between `render-templates.sh` and `build-site.sh` |
| `CLAUDE.md` | Modify | Add `render-functions.sh` to `/build` step list |

---

### Task 1: Test fixture + schema + validate-plan tests

**Files:**
- Create: `scripts/test/fixtures/valid-build-plan-resend.yaml`
- Create: `components/resend-form/schema.json`
- Modify: `scripts/validate-plan.sh`
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

# resend-form: empty fields array → exits 1
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
        from: noreply@example.com
        fields: []
nav:
  order: [home]
contact:
  enabled: false' > "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "resend-form empty fields exits 1" 1 $?

# resend-form: field missing label → exits 1
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
        from: noreply@example.com
        fields:
          - { name: name, type: text, required: true }
nav:
  order: [home]
contact:
  enabled: false' > "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "resend-form field missing label exits 1" 1 $?

# resend-form: field invalid type → exits 1
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
        from: noreply@example.com
        fields:
          - { name: name, label: Name, type: number, required: true }
nav:
  order: [home]
contact:
  enabled: false' > "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "resend-form field invalid type exits 1" 1 $?

# resend-form: empty recipient and field name → exits 1
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
        to: ""
        from: noreply@example.com
        fields:
          - { name: "", label: Name, type: text, required: true }
nav:
  order: [home]
contact:
  enabled: false' > "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "resend-form empty strings exit 1" 1 $?
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "resend"
```

Expected: `✗ valid resend-form plan passes` and the field-validation tests also fail — `resend-form` is not yet a known component type and `items`/`min_items` are not yet supported.

- [ ] **Step 4: Extend `validate-plan.sh` to support `items` and `min_items` descriptors**

`validateValue` currently supports `type`, `enum`, `non_empty`, `required`, and `optional`. Add `items` (validates each element of an array against a descriptor) and `min_items` (requires at least N elements). The recognized descriptor keys set must be expanded to include `items` and `min_items`. After the existing `type: 'string'` and `type: 'object'` blocks, add:

```javascript
if (descriptor.type === 'array') {
  if (typeof descriptor.min_items === 'number' && value.length < descriptor.min_items)
    errors.push(fieldPath + ' must have at least ' + descriptor.min_items + ' item(s)');
  if (descriptor.items) {
    value.forEach(function(item, idx) {
      validateValue(item, descriptor.items, fieldPath + '[' + idx + ']');
    });
  }
}
```

Also add `'items'` and `'min_items'` to the `descriptorKeys` set so they are not rejected as unknown rules.

- [ ] **Step 5: Create `components/resend-form/schema.json`**

Create `components/resend-form/schema.json` using structural descriptors that `validate-plan.sh` can actually interpret:

```json
{
  "description": "Contact form with server-side email delivery via Resend. Requires RESEND_API_KEY in .env and a Resend-verified sender address in the 'from' field.",
  "required": {
    "to": { "type": "string", "non_empty": true },
    "from": { "type": "string", "non_empty": true },
    "fields": {
      "type": "array",
      "min_items": 1,
      "items": {
        "type": "object",
        "required": {
          "name": { "type": "string", "non_empty": true },
          "label": { "type": "string", "non_empty": true },
          "type": { "type": "string", "enum": ["text", "email", "textarea"] },
          "required": "boolean"
        }
      }
    }
  },
  "optional": {
    "subject": { "type": "string", "non_empty": true },
    "submit_label": "string",
    "success_message": "string"
  },
  "example": "type: resend-form\nto: hello@example.com\nfrom: noreply@example.com    # must be a Resend-verified address\nsubject: Message from my-site  # optional, default generated from site name\nsubmit_label: Send             # optional, default: Send\nsuccess_message: Thanks, we will be in touch.  # optional\nfields:                        # at least one required\n  - { name: name,    label: Your name,  type: text,     required: true }\n  - { name: email,   label: Your email, type: email,    required: true }\n  - { name: message, label: Message,    type: textarea, required: true }\n"
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "resend|Results"
```

Expected: all resend assertions pass including field-level checks (`valid resend-form plan passes`, `missing from exits 1`, `missing to exits 1`, `empty fields exits 1`, `field missing label exits 1`, `field invalid type exits 1`, `empty strings exit 1`), and `Results: N passed, 0 failed`.

- [ ] **Step 7: Commit**

```bash
git add scripts/validate-plan.sh \
        scripts/test/fixtures/valid-build-plan-resend.yaml \
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

**Note:** `scaffold/.eleventy.js` sets `autoescape: false`. Every user-supplied value rendered into HTML must use `| escape` explicitly.

Create `components/resend-form/component.njk`:

```html
{% set successMsg = (component.success_message or "Thanks, we will be in touch.") | escape %}
<div class="c-resend-form">
  <form class="c-resend-form__form">
    {% for field in component.fields %}
    <div class="c-resend-form__field">
      <label for="rf-{{ field.name | escape }}">{{ field.label | escape }}{% if field.required %} <span class="c-resend-form__required">*</span>{% endif %}</label>
      {% if field.type == 'textarea' %}
      <textarea id="rf-{{ field.name | escape }}" name="{{ field.name | escape }}"{% if field.required %} required{% endif %}></textarea>
      {% else %}
      <input id="rf-{{ field.name | escape }}" name="{{ field.name | escape }}" type="{{ field.type | escape }}"{% if field.required %} required{% endif %}>
      {% endif %}
    </div>
    {% endfor %}
    <button type="submit" class="c-resend-form__submit"
            data-label="{{ (component.submit_label or 'Send') | escape }}">{{ (component.submit_label or "Send") | escape }}</button>
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
          btn.textContent = btn.dataset.label || 'Send';
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

  const CONFIG = {{CONFIG}};

  let data;
  try { data = await context.request.json(); }
  catch { return Response.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return Response.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  // Server-side validation: required fields, length cap
  for (const field of CONFIG.fields) {
    const val = String(data[field.name] ?? '').trim();
    if (field.required && !val)
      return Response.json({ ok: false, error: 'Missing required field' }, { status: 400 });
    if (val.length > (field.maxLength || 10000))
      return Response.json({ ok: false, error: 'Field too long' }, { status: 400 });
  }

  // Only include fields declared in the component config — ignores extra POST keys
  const body = CONFIG.fields
    .map(f => `${f.name}: ${String(data[f.name] ?? '')}`)
    .join('\n\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      to:      [CONFIG.to],
      from:    CONFIG.from,
      subject: CONFIG.subject,
      text:    body,
    }),
  });

  return res.ok
    ? Response.json({ ok: true })
    : Response.json({ ok: false, error: 'Email delivery failed' }, { status: 502 });
}
```

`{{CONFIG}}` is replaced by `render-functions.sh` with a `JSON.stringify` call — not raw string substitution — so apostrophes, backslashes, or special characters in addresses or subjects cannot corrupt the generated JS.

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

# No resend-form in plan, no prior functions/ → exits 0, functions/ NOT created
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

# Stale cleanup: no resend-form in plan, but functions/api/contact.js exists from a prior run
cp scripts/test/fixtures/valid-build-plan-components.yaml "${SITE_DIR}/build-plan.yaml"
mkdir -p "${SITE_DIR}/functions/api"
echo "stale" > "${SITE_DIR}/functions/api/contact.js"
bash scripts/render-functions.sh > /dev/null 2>&1; assert_exit "stale cleanup → exits 0" 0 $?
if [ ! -f "${SITE_DIR}/functions/api/contact.js" ]; then
  echo "  ✓ stale functions/api/contact.js removed"
  PASS=$((PASS + 1))
else
  echo "  ✗ stale functions/api/contact.js was not removed"
  FAIL=$((FAIL + 1))
fi
if [ ! -d "${SITE_DIR}/functions" ]; then
  echo "  ✓ empty functions/ directory removed"
  PASS=$((PASS + 1))
else
  echo "  ✗ empty functions/ directory was not removed"
  FAIL=$((FAIL + 1))
fi

# resend-form found → creates functions/api/contact.js with CONFIG serialized as JSON
cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/functions"
bash scripts/render-functions.sh > /dev/null 2>&1; assert_exit "resend-form → exits 0" 0 $?
assert_file_exists "functions/api/contact.js created" "${SITE_DIR}/functions/api/contact.js"
FUNC=$(cat "${SITE_DIR}/functions/api/contact.js")
assert_contains "config has to address"      "hello@example.com"        "$FUNC"
assert_contains "config has from address"    "noreply@example.com"      "$FUNC"
assert_contains "config has subject"         "Message from resend-test" "$FUNC"
assert_contains "function has handler"       "onRequestPost"            "$FUNC"
assert_contains "config assigned to CONFIG"  "const CONFIG ="           "$FUNC"
assert_contains "function rejects null JSON"  "!data || typeof data !== 'object' || Array.isArray(data)" "$FUNC"
if ! echo "$FUNC" | grep -qF "{{CONFIG}}"; then
  echo "  ✓ {{CONFIG}} placeholder replaced"
  PASS=$((PASS + 1))
else
  echo "  ✗ {{CONFIG}} placeholder still present"
  FAIL=$((FAIL + 1))
fi
if ! echo "$FUNC" | grep -qF "{{TO}}" && ! echo "$FUNC" | grep -qF "{{FROM}}" && ! echo "$FUNC" | grep -qF "{{SUBJECT}}"; then
  echo "  ✓ no legacy TO/FROM/SUBJECT placeholders in output"
  PASS=$((PASS + 1))
else
  echo "  ✗ legacy TO/FROM/SUBJECT placeholders found in output"
  FAIL=$((FAIL + 1))
fi

# Default subject generated when omitted
printf '%s\n' 'slug: sub-test
name: My Cool Site
overview: Test.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
    components:
      - type: resend-form
        to: hello@example.com
        from: noreply@example.com
        fields:
          - { name: name, label: Name, type: text, required: true }
nav:
  order: [home]
contact:
  enabled: false' > "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/functions"
bash scripts/render-functions.sh > /dev/null 2>&1
FUNC=$(cat "${SITE_DIR}/functions/api/contact.js" 2>/dev/null || echo "")
assert_contains "default subject from plan name" "Message from My Cool Site" "$FUNC"

# Special characters in values are JSON-serialized safely
printf '%s\n' "slug: special-test
name: O'Brien's Site
overview: Test.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
    components:
      - type: resend-form
        to: hello@example.com
        from: noreply@example.com
        subject: \"It's a \\\"test\\\"\"
        fields:
          - { name: name, label: Name, type: text, required: true }
nav:
  order: [home]
contact:
  enabled: false" > "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/functions"
bash scripts/render-functions.sh > /dev/null 2>&1
FUNC=$(cat "${SITE_DIR}/functions/api/contact.js" 2>/dev/null || echo "")
if node -e "const f = require('fs').readFileSync('${SITE_DIR}/functions/api/contact.js','utf8'); eval(f.match(/const CONFIG = (.+);/)[1]); process.exit(0);" 2>/dev/null; then
  echo "  ✓ generated CONFIG is valid JSON (special chars serialized safely)"
  PASS=$((PASS + 1))
else
  echo "  ✗ generated CONFIG is not valid JSON"
  FAIL=$((FAIL + 1))
fi

# Field allowlist: fields array in CONFIG contains only name/required/maxLength (not label/type)
cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/functions"
bash scripts/render-functions.sh > /dev/null 2>&1
FUNC=$(cat "${SITE_DIR}/functions/api/contact.js" 2>/dev/null || echo "")
assert_contains "CONFIG fields include required flag" '"required"' "$FUNC"
assert_contains "CONFIG fields include maxLength"     '"maxLength"' "$FUNC"
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
const functionsDir  = path.join(siteDir, 'functions');

let found = null;
for (const page of (plan.pages || [])) {
  for (const comp of (page.components || [])) {
    if (comp.type === 'resend-form') { found = comp; break; }
  }
  if (found) break;
}

if (!found) {
  // Remove only the generated file and empty parent directories.
  // Do not use rmSync recursive — that would erase Functions owned by future components.
  const contactFile = path.join(functionsDir, 'api', 'contact.js');
  const apiDir = path.join(functionsDir, 'api');
  if (fs.existsSync(contactFile)) {
    fs.rmSync(contactFile);
    if (fs.readdirSync(apiDir).length === 0) fs.rmdirSync(apiDir);
    if (fs.existsSync(functionsDir) && fs.readdirSync(functionsDir).length === 0) fs.rmdirSync(functionsDir);
    console.log('✓ Removed stale functions/api/contact.js (no resend-form in plan)');
  }
  process.exit(0);
}

const template = path.join(componentsDir, 'resend-form', 'function.template.js');
if (!fs.existsSync(template)) {
  console.error('Error: ' + template + ' not found.');
  process.exit(1);
}

const config = {
  to:      found.to,
  from:    found.from,
  subject: (found.subject || '').trim() || ('Message from ' + plan.name),
  fields:  (found.fields || []).map(f => ({
    name:      f.name,
    required:  !!f.required,
    maxLength: f.maxLength || 10000,
  })),
};

const src = fs.readFileSync(template, 'utf8')
  .replace('{{CONFIG}}', JSON.stringify(config));

const outDir = path.join(siteDir, 'functions', 'api');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'contact.js'), src);
console.log('✓ Rendered functions/api/contact.js (to: ' + config.to + ')');
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

### Task 5: deploy.sh — cd to site dir and RESEND_API_KEY secret

**Files:**
- Modify: `scripts/deploy.sh`

Automated tests use a fake `wrangler` stub for deploy control flow. A live Cloudflare + Resend smoke test is still included at the end of this task.

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
# Push RESEND_API_KEY as a Pages secret when the site uses resend-form.
# Check for the generated contact Function specifically — not just any functions/ directory,
# since future components may create their own Functions without needing a Resend key.
# Abort if the key is missing or the push fails — a silent failure would deploy
# a live URL with a permanently broken contact form.
if [ -f "${SITE_DIR}/functions/api/contact.js" ]; then
  if [ -z "${RESEND_API_KEY:-}" ]; then
    echo "Error: RESEND_API_KEY is not set in .env but this site uses resend-form."
    echo "Add RESEND_API_KEY=re_... to .env and redeploy."
    exit 1
  fi
  echo "Setting RESEND_API_KEY secret for '$SITE_NAME'..."
  if ! printf '%s' "$RESEND_API_KEY" | wrangler pages secret put RESEND_API_KEY \
      --project-name "$SITE_NAME"; then
    echo "Error: failed to set RESEND_API_KEY Pages secret."
    exit 1
  fi
  echo ""
  echo "Warning: your contact form has no bot protection."
  echo "Add Turnstile before promoting this site to production."
  echo ""
fi

echo "Deploying '$SITE_NAME' to Cloudflare Pages..."
echo ""

# Wrangler discovers functions/ by convention relative to its cwd.
# There is no --functions-dir flag; we cd into SITE_DIR so Wrangler
# finds functions/ automatically.
cd "${SITE_DIR}"
wrangler pages deploy dist --project-name "$SITE_NAME" \
  > ".deploy-output" 2> ".deploy-error"
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > ".deploy-exit"
exit $WRANGLER_EXIT
```

- [ ] **Step 3: Verify the script is syntactically valid**

```bash
bash -n scripts/deploy.sh
```

Expected: no output (no syntax errors).

- [ ] **Step 4: Add automated deploy.sh tests using a fake wrangler stub**

In `scripts/test/run-tests.sh`, find the `# ── Results` line and insert a new section immediately before it:

```bash
# ── deploy.sh (stub wrangler) ─────────────────────────────────────────────────
echo ""
echo "=== deploy.sh (stub wrangler) ==="

# Build a temporary fake wrangler that logs its args and cwd, then exits with
# WRANGLER_STUB_EXIT (default 0). PATH is prepended so it takes priority.
_STUB_DIR=$(mktemp -d)
_STUB_LOG="${_STUB_DIR}/wrangler.log"
cat > "${_STUB_DIR}/wrangler" << STUB
#!/usr/bin/env bash
echo "cwd=\$(pwd)" >> "${_STUB_LOG}"
echo "args=\$*"   >> "${_STUB_LOG}"
# Fail only for "pages secret put" when WRANGLER_SECRET_FAIL=1; all other
# invocations (project create, pages deploy) succeed unconditionally.
if [ "\${WRANGLER_SECRET_FAIL:-0}" = "1" ] && echo "\$*" | grep -q "secret put"; then
  exit 1
fi
exit 0
STUB
chmod +x "${_STUB_DIR}/wrangler"
export PATH="${_STUB_DIR}:${PATH}"

# Prepare a site dir with a valid build and a functions/ directory.
# dist/index.html is required — deploy.sh rejects an empty dist/ before any tested behavior.
cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
mkdir -p "${SITE_DIR}/dist" "${SITE_DIR}/functions/api"
echo "<html></html>" > "${SITE_DIR}/dist/index.html"
echo "// stub" > "${SITE_DIR}/functions/api/contact.js"
echo "0" > "${SITE_DIR}/.deploy-exit"  # satisfy deploy-finalize pre-check

# Missing RESEND_API_KEY when functions/ exists → exits 1 without calling wrangler
rm -f "${_STUB_LOG}"
( unset RESEND_API_KEY; SITE_NAME=resend-test SITE_DIR="${SITE_DIR}" bash scripts/deploy.sh > /dev/null 2>&1 )
assert_exit "missing RESEND_API_KEY exits 1" 1 $?
if [ ! -f "${_STUB_LOG}" ] || ! grep -q "pages deploy" "${_STUB_LOG}" 2>/dev/null; then
  echo "  ✓ wrangler deploy not called when key missing"
  PASS=$((PASS + 1))
else
  echo "  ✗ wrangler deploy was called despite missing key"
  FAIL=$((FAIL + 1))
fi

# Secret push failure → exits non-zero before deploy
rm -f "${_STUB_LOG}"
WRANGLER_SECRET_FAIL=1 RESEND_API_KEY=re_test SITE_NAME=resend-test SITE_DIR="${SITE_DIR}" \
  bash scripts/deploy.sh > /dev/null 2>&1
_DEPLOY_EXIT=$?
if [ "$_DEPLOY_EXIT" -ne 0 ]; then
  echo "  ✓ secret push failure aborts deploy"
  PASS=$((PASS + 1))
else
  echo "  ✗ deploy succeeded despite secret push failure"
  FAIL=$((FAIL + 1))
fi
if ! grep -q "pages deploy" "${_STUB_LOG}" 2>/dev/null; then
  echo "  ✓ wrangler pages deploy not called after failed secret push"
  PASS=$((PASS + 1))
else
  echo "  ✗ wrangler pages deploy was called after failed secret push"
  FAIL=$((FAIL + 1))
fi

# Successful deploy: wrangler runs from site dir, output files written inside site dir
rm -f "${_STUB_LOG}"
RESEND_API_KEY=re_test SITE_NAME=resend-test SITE_DIR="${SITE_DIR}" \
  bash scripts/deploy.sh > /dev/null 2>&1 || true
if grep -q "cwd=${SITE_DIR}" "${_STUB_LOG}" 2>/dev/null; then
  echo "  ✓ wrangler runs from SITE_DIR (correct cwd)"
  PASS=$((PASS + 1))
else
  echo "  ✗ wrangler did not run from SITE_DIR"
  FAIL=$((FAIL + 1))
fi
assert_file_exists "deploy-output written inside site dir" "${SITE_DIR}/.deploy-output"
assert_file_exists "deploy-exit written inside site dir"   "${SITE_DIR}/.deploy-exit"

# No contact.js → wrangler called without secret push (even if functions/ dir exists from another component)
rm -rf "${SITE_DIR}/functions" "${_STUB_LOG}"
RESEND_API_KEY=re_test SITE_NAME=resend-test SITE_DIR="${SITE_DIR}" \
  bash scripts/deploy.sh > /dev/null 2>&1 || true
CALL_COUNT=$(grep -c "pages" "${_STUB_LOG}" 2>/dev/null || echo 0)
if [ "$CALL_COUNT" -eq 1 ]; then
  echo "  ✓ only one wrangler call (deploy only, no secret push) when no contact.js"
  PASS=$((PASS + 1))
else
  echo "  ✗ unexpected wrangler call count: $CALL_COUNT"
  FAIL=$((FAIL + 1))
fi

export PATH="${PATH#${_STUB_DIR}:}"
rm -rf "${_STUB_DIR}"
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "deploy\.sh|Results"
```

Expected: all deploy stub assertions pass, `Results: N passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy.sh scripts/test/run-tests.sh
git commit -m "feat(resend-form): deploy with cd-to-site-dir and RESEND_API_KEY secret"
```

- [ ] **Step 7: Manual smoke test (requires Cloudflare + Resend credentials)**

Add a `resend-form` component to an existing test site's `build-plan.yaml`. Ensure `RESEND_API_KEY=re_...` is in `.env`. Then:

```bash
SITE_DIR=sites/<site-name> bash scripts/render-functions.sh
ls sites/<site-name>/functions/api/contact.js   # should exist
SITE_DIR=sites/<site-name> bash scripts/build-site.sh
SITE_DIR=sites/<site-name> bash scripts/deploy.sh
```

Expected: deploy output includes `Setting RESEND_API_KEY secret`, bot-protection warning, then wrangler deploy succeeds and returns a live URL. Submit the form and verify email arrives. Check that `.deploy-output` and `.deploy-exit` are written inside `sites/<site-name>/` (not the repo root).

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

---

### Task 6b: deploy-finalize.sh — NEXT-STEPS.md bot-protection warning

**Files:**
- Modify: `scripts/deploy-finalize.sh`

The spec promises that both deploy output and `NEXT-STEPS.md` warn about missing bot protection. `deploy.sh` already prints the warning to stdout; `deploy-finalize.sh` must append a section to `NEXT-STEPS.md` when a contact Function is present.

- [ ] **Step 1: Add the conditional append to deploy-finalize.sh**

After the `sed` line that generates `NEXT-STEPS.md`, add:

The heredoc must be **unquoted** (`<< RESEND_WARNING`, not `<< 'RESEND_WARNING'`) so that `$SITE_NAME` expands at runtime:

```bash
if [ -f "${SITE_DIR}/functions/api/contact.js" ]; then
  cat >> "${SITE_DIR}/NEXT-STEPS.md" << RESEND_WARNING

---

## Contact form: add bot protection before going live

Your site includes a \`resend-form\` contact form. The \`/api/contact\` endpoint
is publicly accessible with no rate limiting or bot protection. Before
promoting this site:

1. Add **Cloudflare Turnstile** — run \`/domain $SITE_NAME\` first, then see
   the Turnstile skill in Claude Code
2. Or enable **Rate Limiting** on \`/api/contact\` in the Cloudflare dashboard

Without this, anyone can automate submissions and exhaust your Resend quota,
damaging your sender reputation.
RESEND_WARNING
fi
```

Note: backticks and dollar signs that should appear literally in the output must be escaped with `\` when using an unquoted heredoc.

- [ ] **Step 2: Add a test for warning presence and substitution**

In `scripts/test/run-tests.sh`, after the `render-functions.sh` section and before `# ── Results`, add:

```bash
# ── deploy-finalize.sh ────────────────────────────────────────────────────────
echo ""
echo "=== deploy-finalize.sh (NEXT-STEPS warning) ==="

# Set up minimal state deploy-finalize.sh requires
cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
mkdir -p "${SITE_DIR}/functions/api" "${SITE_DIR}/dist"
echo "// stub" > "${SITE_DIR}/functions/api/contact.js"
# Fake deploy output with a pages.dev URL
echo "https://abc12345.resend-test.pages.dev" > "${SITE_DIR}/.deploy-output"

SITE_NAME=resend-test SITE_DIR="${SITE_DIR}" bash scripts/deploy-finalize.sh > /dev/null 2>&1
assert_file_exists "NEXT-STEPS.md created" "${SITE_DIR}/NEXT-STEPS.md"
NS=$(cat "${SITE_DIR}/NEXT-STEPS.md")
assert_contains "warning section present" "bot protection" "$NS"
# Extract only the warning section (after the last ---) and check $SITE_NAME was substituted there
WARNING_SECTION=$(echo "$NS" | awk '/^---/{block=""} {block=block"\n"$0} END{print block}')
if echo "$WARNING_SECTION" | grep -q "resend-test"; then
  echo "  ✓ SITE_NAME substituted inside the warning block"
  PASS=$((PASS + 1))
else
  echo "  ✗ SITE_NAME not substituted inside the warning block"
  FAIL=$((FAIL + 1))
fi
if ! echo "$NS" | grep -qF "{{SITE_NAME}}"; then
  echo "  ✓ no literal {{SITE_NAME}} placeholder in NEXT-STEPS.md"
  PASS=$((PASS + 1))
else
  echo "  ✗ {{SITE_NAME}} placeholder not substituted"
  FAIL=$((FAIL + 1))
fi

# Without contact.js, no warning section appended
rm -f "${SITE_DIR}/functions/api/contact.js" "${SITE_DIR}/NEXT-STEPS.md"
SITE_NAME=resend-test SITE_DIR="${SITE_DIR}" bash scripts/deploy-finalize.sh > /dev/null 2>&1
NS=$(cat "${SITE_DIR}/NEXT-STEPS.md" 2>/dev/null || echo "")
if ! echo "$NS" | grep -q "bot protection"; then
  echo "  ✓ no warning when contact.js absent"
  PASS=$((PASS + 1))
else
  echo "  ✗ warning present despite no contact.js"
  FAIL=$((FAIL + 1))
fi
```

- [ ] **Step 3: Verify syntax**

```bash
bash -n scripts/deploy-finalize.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy-finalize.sh scripts/test/run-tests.sh
git commit -m "feat(resend-form): append bot-protection warning to NEXT-STEPS.md"
```

---

### Task 7: mcp/pipeline.js — insert render-functions.sh

**Files:**
- Modify: `mcp/pipeline.js`

The MCP `deploy_site` tool has its own hardcoded script list (line 69) that runs independently of `CLAUDE.md`. Without this update, sites built via the MCP path skip Function generation entirely.

- [ ] **Step 1: Update the scripts array in mcp/pipeline.js**

Find the `scripts` array (around line 69):

```javascript
const scripts = [
  'validate-plan.sh',
  'write-site-json.sh',
  'apply-theme.sh',
  'render-templates.sh',
  'build-site.sh',
  'deploy.sh',
  'deploy-finalize.sh',
];
```

Replace with:

```javascript
const scripts = [
  'validate-plan.sh',
  'write-site-json.sh',
  'apply-theme.sh',
  'render-templates.sh',
  'render-functions.sh',
  'build-site.sh',
  'deploy.sh',
  'deploy-finalize.sh',
];
```

- [ ] **Step 2: Verify syntax**

```bash
node --check mcp/pipeline.js
```

- [ ] **Step 3: Commit**

```bash
git add mcp/pipeline.js
git commit -m "feat(resend-form): add render-functions.sh to MCP pipeline"
```
