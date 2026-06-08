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
| `function.template.js` | Pages Function source with a `{{CONFIG}}` placeholder (replaced with a `JSON.stringify`-serialized config object at build time) |

`generate-catalog-md.sh` is already dynamic — `resend-form` appears in `CATALOG.md` automatically once the directory exists.

### 2. Component schema

**Required fields:**

| Field | Type | Notes |
|-------|------|-------|
| `to` | non-empty string | Recipient email — baked into function at build time |
| `from` | non-empty string | Sender email — must be a Resend-verified address |
| `fields` | array | At least one item required. Each item must have non-empty `name` and `label` strings, `type` (one of `text`, `email`, `textarea`), and `required` (boolean). `validate-plan.sh` enforces all four constraints. |

**Optional fields:**

| Field | Type | Default |
|-------|------|---------|
| `subject` | non-empty string | `"Message from [site name]"` — generated at build time from `build-plan.yaml` `name` field when omitted; Resend rejects empty subjects |
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

`components/resend-form/function.template.js` — `{{CONFIG}}` is replaced at build time with a single `JSON.stringify` call, producing `sites/<name>/functions/api/contact.js`:

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

  // Server-side validation: required fields, type coercion, length cap
  for (const field of CONFIG.fields) {
    const val = String(data[field.name] ?? '').trim();
    if (field.required && !val)
      return Response.json({ ok: false, error: 'Missing required field' }, { status: 400 });
    if (val.length > (field.maxLength || 10000))
      return Response.json({ ok: false, error: 'Field too long' }, { status: 400 });
  }

  // Only include fields declared in the component config — ignores any extra keys in the POST body
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

`render-functions.sh` emits `{{CONFIG}}` using `JSON.stringify({ to, from, subject, fields })` where `fields` is an array of `{ name, required, maxLength }` metadata objects (not bare name strings) — the Function uses these for server-side validation as well as body construction. Using JSON serialization (rather than raw string replacement) means apostrophes, backslashes, and special characters in addresses or subjects cannot corrupt the generated JS.

**Security notes:**
- `to` / `from` / `subject` are baked in at build time — an attacker cannot redirect email to an arbitrary address
- `CONFIG.fields` allowlist prevents an attacker from injecting arbitrary keys into the email body via a crafted POST
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
3. If none found → **delete only `functions/api/contact.js`** and empty parent directories (`functions/api/`, `functions/`) if they exist — does not touch other Functions that future components may own — then exit 0
4. If found → read `to`, `from`, `subject` from the first `resend-form` component; default `subject` to `"Message from [plan.name]"` if absent or empty
5. Build config object: `{ to, from, subject, fields: [{ name, required, maxLength }] }` — full field metadata included so the Pages Function can validate submissions server-side
6. Create `sites/<name>/functions/api/` directory
7. Read `components/resend-form/function.template.js`, replace `{{CONFIG}}` with `JSON.stringify(config)`, write to `sites/<name>/functions/api/contact.js`

The `functions/` directory lives at `sites/<name>/functions/` — outside `dist/` — so Eleventy never sees it.

**`CLAUDE.md` update:** add `render-functions.sh` to the `/build` command steps.
**`mcp/pipeline.js` update:** insert `render-functions.sh` between `render-templates.sh` and `build-site.sh` in the hardcoded script array (line 69).

### 5. Deploy changes: `deploy.sh`

**Functions discovery:** Wrangler discovers `functions/` by convention relative to its working directory — there is no `--functions-dir` flag. `deploy.sh` must `cd` into `${SITE_DIR}` before deploying and pass `dist` as a relative path:

```bash
cd "${SITE_DIR}"
wrangler pages deploy dist \
  --project-name "$SITE_NAME" \
  > ".deploy-output" 2> ".deploy-error"
```

**`RESEND_API_KEY` secret push** (after project creation, before deploy):

Check for the specific generated file rather than any `functions/` directory, so future components can create their own Functions without triggering a Resend key requirement:

```bash
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
fi
```

A failed secret push aborts the deploy with a clear error — silently continuing would produce a live URL with a permanently broken contact form. If `RESEND_API_KEY` is missing entirely, the deploy also aborts with an actionable message.

No changes to `setup.sh` — `RESEND_API_KEY` is optional and only relevant at deploy time.

### 6. Form UX

Three states handled inline in `component.njk` — no page navigation, no external library:

| State | Behaviour |
|-------|-----------|
| **Submitting** | Button disabled, label → "Sending…" |
| **Success** | Form replaced with `success_message` text |
| **Error** | Error text shown below button, button re-enabled for retry |

Error message shown to user: "Something went wrong — please try again." No server detail exposed.

**Escaping:** `scaffold/.eleventy.js` sets `autoescape: false`, so Nunjucks does not escape output automatically. All user-supplied values in `component.njk` must use the `| escape` filter explicitly. The submit button carries its label in a `data-label` attribute so the value stays in HTML and never inside a `<script>` block:

```html
<button type="submit" class="c-resend-form__submit"
        data-label="{{ (component.submit_label or 'Send') | escape }}">
  {{ (component.submit_label or "Send") | escape }}
</button>
```

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
      form.hidden = true;
      successEl.hidden = false;
    } else {
      throw new Error();
    }
  } catch {
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = btn.dataset.label || 'Send';
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
| `scripts/validate-plan.sh` | Modify — add `items` and `min_items` descriptor support |
| `scripts/render-functions.sh` | Create |
| `scripts/deploy.sh` | Modify — `cd` to site dir + secret push with error handling |
| `scripts/deploy-finalize.sh` | Modify — append bot-protection warning section to `NEXT-STEPS.md` when `functions/api/contact.js` is present |
| `mcp/pipeline.js` | Modify — insert `render-functions.sh` in script array |
| `CLAUDE.md` | Modify — add `render-functions.sh` to `/build` steps |

---

## Deferred

- **Unification with `mailto-form` into `contact-form`** — deferred until both components exist and the right abstraction is clear.
- **Multiple `resend-form` components per site** — v1 uses first-found `to`/`from`/`subject`.
- **`RESEND_FROM` as a global `.env` default** — v1 requires `from` in every `resend-form` component; a global fallback is a future `.env` option.
- **Turnstile / bot protection** — natural next step after this ships; Pages Function is already the right place to add it. v1 accepts this as a documented product-test risk: `deploy.sh` and `NEXT-STEPS.md` will print a visible warning ("Your contact form has no bot protection — add Turnstile before promoting this site") whenever a `resend-form` is present.
- **Error detail from Resend API** — currently masked; could be logged to console for debugging without exposing to users.
