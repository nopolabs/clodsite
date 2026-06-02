# `resend-form` Component — Design

**Date:** 2026-06-02
**Status:** Approved, ready for implementation plan
**Related roadmap entries:** "Contact form + form backend", "Page-types extension track — Slice 4 (Cloudflare Pages Functions + secrets pipeline)"

---

## Background

Clodsite's existing `mailto-form` component is purely client-side: on submit it builds a `mailto:` URL and navigates to it, opening the user's email app. This works without a backend but produces a poor UX and is unreliable on mobile.

`resend-form` is a new component type that backs the contact form with a Cloudflare Pages Function calling the Resend API. The function is generated at build time from a template co-located with the component. `RESEND_API_KEY` lives in `.env` (alongside the Cloudflare credentials) and is pushed to Pages secrets at deploy time.

`mailto-form` is unchanged. `resend-form` sits alongside it in the catalog. Unification into a single `contact-form` component is deferred.

---

## Mental Model

```
User submits form
      ↓  POST /api/contact (JSON)
Pages Function (generated at build time)
      ↓  RESEND_API_KEY from Pages secrets
      ↓  to / from / subject baked in at build time
Resend API → email delivered
      ↓  { ok: true } or { ok: false }
Form JS → success message or retry
```

---

## Design

### 1. Component files

`components/resend-form/` contains four files:

| File | Purpose |
|------|---------|
| `schema.json` | Field definitions for `validate-plan.sh` and `get_schema` |
| `component.njk` | Form HTML + inline JS for fetch/states |
| `component.css` | Styles (submitting, success, error states) |
| `function.template.js` | Pages Function source with `{{TO}}`, `{{FROM}}`, `{{SUBJECT}}` placeholders |

`generate-catalog-md.sh` is already dynamic — `resend-form` appears in `CATALOG.md` automatically once the directory exists.

### 2. Component schema

**Required fields:**

| Field | Type | Notes |
|-------|------|-------|
| `to` | string | Recipient email — baked into function at build time |
| `from` | string | Sender email — must be a Resend-verified address |
| `fields` | array | Same field shape as `mailto-form` |

**Optional fields:**

| Field | Type | Default |
|-------|------|---------|
| `subject` | string | `""` (empty, Resend will use a default) |
| `submit_label` | string | `"Send"` |
| `success_message` | string | `"Thanks — we'll be in touch."` |

**Example in `build-plan.yaml`:**

```yaml
- type: resend-form
  to: hello@example.com
  from: noreply@example.com    # must be Resend-verified
  subject: Message from my-site
  submit_label: Send
  success_message: Thanks — we'll be in touch.
  fields:
    - { name: name,    label: Your name,  type: text,     required: true }
    - { name: email,   label: Email,      type: email,    required: true }
    - { name: message, label: Message,    type: textarea, required: true }
```

### 3. Pages Function template

`components/resend-form/function.template.js` — substituted at build time to produce `sites/<name>/functions/api/contact.js`:

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

**Security notes:**
- `to` / `from` / `subject` are baked in at build time — an attacker cannot redirect email to an arbitrary address
- `RESEND_API_KEY` comes from Pages secrets (env binding), never from the client
- Raw Resend `fetch` with no SDK dependency (same pattern as `~/dev/parchment/src/email.ts`)
- ES module syntax (`export async function`) required for Cloudflare Pages Functions

**v1 constraint:** Only one `resend-form` per site is supported. If a second `resend-form` appears on a different page, it routes to the same `/api/contact` endpoint — `to` / `from` / `subject` from the first component found are used.

### 4. Build pipeline: `render-functions.sh`

New script added between `render-templates.sh` and `build-site.sh`:

```
[SCRIPT] bash scripts/validate-plan.sh
[SCRIPT] bash scripts/write-site-json.sh
[SCRIPT] bash scripts/apply-theme.sh
[SCRIPT] bash scripts/render-templates.sh
[SCRIPT] bash scripts/render-functions.sh    ← new
[SCRIPT] bash scripts/build-site.sh
```

**`render-functions.sh` logic:**

1. Read `build-plan.yaml` with `js-yaml`
2. Scan all pages for any component with `type: resend-form`
3. If none found → exit 0 silently (no-op for sites without `resend-form`)
4. If found → read `to`, `from`, `subject` from the first `resend-form` component
5. Create `sites/<name>/functions/api/` directory
6. Read `components/resend-form/function.template.js`, substitute `{{TO}}`, `{{FROM}}`, `{{SUBJECT}}`, write to `sites/<name>/functions/api/contact.js`

The `functions/` directory lives at `sites/<name>/functions/` — outside `dist/` — so Eleventy never sees it.

**`CLAUDE.md` update:** add `render-functions.sh` to the `/build` command steps.

### 5. Deploy changes: `deploy.sh`

**`--functions-dir` flag:**

```bash
FUNCTIONS_ARGS=""
if [ -d "${SITE_DIR}/functions" ]; then
  FUNCTIONS_ARGS="--functions-dir ${SITE_DIR}/functions"
fi

wrangler pages deploy "${SITE_DIR}/dist" \
  --project-name "$SITE_NAME" \
  $FUNCTIONS_ARGS \
  > "${SITE_DIR}/.deploy-output" 2> "${SITE_DIR}/.deploy-error"
```

**`RESEND_API_KEY` secret push** (after project creation, before deploy):

```bash
if [ -d "${SITE_DIR}/functions" ] && [ -n "${RESEND_API_KEY:-}" ]; then
  echo "$RESEND_API_KEY" | wrangler pages secret put RESEND_API_KEY \
    --project-name "$SITE_NAME" 2>/dev/null || true
fi
```

`|| true` prevents a failed push (e.g., key already set) from aborting the deploy. If `RESEND_API_KEY` is absent from `.env`, the secret is not pushed — the function returns `500 Not configured` until the key is added and the site redeployed.

No changes to `setup.sh` — `RESEND_API_KEY` is optional and only relevant at deploy time.

### 6. Form UX

Three states handled inline in `component.njk` — no page navigation, no external library:

| State | Behaviour |
|-------|-----------|
| **Submitting** | Button disabled, label → "Sending…" |
| **Success** | Form replaced with `success_message` text |
| **Error** | Error text shown below button, button re-enabled for retry |

Error message shown to user: "Something went wrong — please try again." No server detail exposed.

```javascript
form.addEventListener('submit', async function(e) {
  e.preventDefault();
  btn.disabled = true;
  btn.textContent = 'Sending…';
  errorEl.hidden = true;

  const data = {};
  for (const el of form.elements) {
    if (el.name) data[el.name] = el.value;
  }

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      form.innerHTML = '<p class="c-resend-form__success">{{ component.success_message or "Thanks — we\'ll be in touch." }}</p>';
    } else {
      throw new Error();
    }
  } catch {
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = '{{ component.submit_label or "Send" }}';
  }
});
```

---

## Files Changed

| File | Action |
|------|--------|
| `components/resend-form/schema.json` | Create |
| `components/resend-form/component.njk` | Create |
| `components/resend-form/component.css` | Create |
| `components/resend-form/function.template.js` | Create |
| `scripts/render-functions.sh` | Create |
| `scripts/deploy.sh` | Modify — `--functions-dir` + secret push |
| `CLAUDE.md` | Modify — add `render-functions.sh` to `/build` steps |

---

## Deferred

- **Unification with `mailto-form` into `contact-form`** — deferred until both components exist and the right abstraction is clear.
- **Multiple `resend-form` components per site** — v1 uses first-found `to`/`from`/`subject`.
- **`RESEND_FROM` as a global `.env` default** — v1 requires `from` in every `resend-form` component; a global fallback is a future `.env` option.
- **Turnstile / bot protection** — natural next step after this ships; Pages Function is already the right place to add it.
- **Error detail from Resend API** — currently masked; could be logged to console for debugging without exposing to users.
