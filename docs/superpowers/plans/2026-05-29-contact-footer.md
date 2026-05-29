# Contact Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move contact from a special auto-generated page to a footer email link, removing `nav.show_contact_link` and `contact.type` from the schema entirely.

**Architecture:** `contact.enabled` / `contact.email` in the spec drives a footer email link in `base.njk` — nothing else. The auto-generated `contact.njk` step is removed from `/build`. If a site wants a contact page, it adds one to `pages[]` like any other page. Scripts, fixtures, and command files are updated to drop the deprecated fields.

**Tech Stack:** bash, Node.js (validation scripts), Nunjucks (base.njk template)

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `scripts/test/fixtures/valid-spec.json` | Modify | Remove `nav.show_contact_link`, `contact.type` |
| `scripts/test/fixtures/valid-build-plan.json` | Modify | Remove `contact.type` |
| `scripts/test/run-tests.sh` | Modify | Add tests verifying absent fields in site.json output |
| `scripts/validate-spec.sh` | Modify | Remove `contact.type` validation check |
| `scripts/write-site-json.sh` | Modify | Remove `show_contact_link`, `hasContactPage`, `type` |
| `scaffold/src/_includes/base.njk` | Modify | Remove Contact nav link; add footer email |
| `.claude/commands/build.md` | Modify | Remove auto-generated `contact.njk` section |
| `.claude/commands/plan.md` | Modify | Remove `contact.type` from schema and rules |
| `.claude/commands/interview.md` | Modify | Update Q10; remove `show_contact_link` and `type` from schema |
| `ROADMAP.md` | Modify | Update contact form pending entry |

---

### Task 1: Update test fixtures

**Files:**
- Modify: `scripts/test/fixtures/valid-spec.json`
- Modify: `scripts/test/fixtures/valid-build-plan.json`

- [ ] **Step 1: Update valid-spec.json — remove deprecated fields**

Replace the entire file with:

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
  "nav": { "order": ["home", "about"] },
  "contact": { "enabled": false },
  "domain": { "custom": false, "hostname": "" },
  "content_status": "draft",
  "meta": { "generated_at": "2026-05-14T00:00:00Z", "spec_version": "1.0" }
}
```

- [ ] **Step 2: Update valid-build-plan.json — remove contact.type**

Replace the `contact` block in `scripts/test/fixtures/valid-build-plan.json`:

```json
  "contact": {
    "enabled": true,
    "email": "hello@nopolabs.com"
  },
```

(Remove the `"type": "email"` line.)

- [ ] **Step 3: Run the existing test suite — confirm it still passes**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: 35 passed, 0 failed`

- [ ] **Step 4: Commit**

```bash
git add scripts/test/fixtures/valid-spec.json scripts/test/fixtures/valid-build-plan.json
git commit -m "test: remove deprecated nav.show_contact_link and contact.type from fixtures"
```

---

### Task 2: Add failing tests for deprecated field removal

**Files:**
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Add two assertions after the existing write-site-json tests**

Find this block in `scripts/test/run-tests.sh`:

```bash
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
bash scripts/write-site-json.sh > /dev/null 2>&1; assert_exit "write-site-json exits 0" 0 $?
assert_file_exists "${SITE_DIR}/src/_data/site.json created" "${SITE_DIR}/src/_data/site.json"
```

Add immediately after:

```bash
if ! grep -q "show_contact_link" "${SITE_DIR}/src/_data/site.json"; then
  echo "  ✓ show_contact_link absent from site.json"
  PASS=$((PASS + 1))
else
  echo "  ✗ show_contact_link present in site.json (should be removed)"
  FAIL=$((FAIL + 1))
fi
if ! grep -q '"type"' "${SITE_DIR}/src/_data/site.json"; then
  echo "  ✓ contact.type absent from site.json"
  PASS=$((PASS + 1))
else
  echo "  ✗ contact.type present in site.json (should be removed)"
  FAIL=$((FAIL + 1))
fi
```

- [ ] **Step 2: Run tests — confirm the two new assertions FAIL**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: 35 passed, 2 failed` — the two new assertions fail because `write-site-json.sh` still outputs `show_contact_link` and `contact.type`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add scripts/test/run-tests.sh
git commit -m "test: add failing assertions for absent show_contact_link and contact.type in site.json"
```

---

### Task 3: Update validate-spec.sh

**Files:**
- Modify: `scripts/validate-spec.sh`

- [ ] **Step 1: Remove the contact.type check**

Find this block in `scripts/validate-spec.sh` (around line 42):

```javascript
const contact = spec.contact || {};
if (contact.enabled) {
  if (contact.type !== 'email')
    errors.push('contact.type must be \"email\" when contact.enabled is true (form contact is a v2 feature)');
  if (!contact.email)
    errors.push('contact.email is required when contact.enabled is true');
}
```

Replace with:

```javascript
const contact = spec.contact || {};
if (contact.enabled) {
  if (!contact.email)
    errors.push('contact.email is required when contact.enabled is true');
}
```

- [ ] **Step 2: Run tests — confirm all spec tests still pass**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: 35 passed, 2 failed` — same 2 failures as before (write-site-json tests, not yet fixed).

- [ ] **Step 3: Commit**

```bash
git add scripts/validate-spec.sh
git commit -m "feat: remove contact.type validation from validate-spec.sh"
```

---

### Task 4: Update write-site-json.sh

**Files:**
- Modify: `scripts/write-site-json.sh`

- [ ] **Step 1: Replace the siteData construction**

Find this block (lines 14–38):

```javascript
const firstId = spec.nav.order[0];
const navPages = spec.nav.order.map(id => {
  const page = spec.pages.find(p => p.id === id);
  return {
    id: page.id,
    title: page.title,
    href: (page.id === 'home' || id === firstId) ? '/' : '/' + page.id + '/'
  };
});

const hasContactPage = spec.pages.some(p => p.id === 'contact');

const siteData = {
  name: spec.site.name,
  purpose: spec.site.purpose,
  audience: spec.site.audience,
  tone: spec.site.tone,
  style: spec.site.style,
  nav: {
    order: spec.nav.order,
    show_contact_link: spec.nav.show_contact_link && !hasContactPage,
    pages: navPages
  },
  contact: spec.contact || { enabled: false, type: 'email', email: '' }
};
```

Replace with:

```javascript
const firstId = spec.nav.order[0];
const navPages = spec.nav.order.map(id => {
  const page = spec.pages.find(p => p.id === id);
  return {
    id: page.id,
    title: page.title,
    href: (page.id === 'home' || id === firstId) ? '/' : '/' + page.id + '/'
  };
});

const contact = spec.contact || {};
const siteData = {
  name: spec.site.name,
  purpose: spec.site.purpose,
  audience: spec.site.audience,
  tone: spec.site.tone,
  style: spec.site.style,
  nav: {
    order: spec.nav.order,
    pages: navPages
  },
  contact: contact.enabled
    ? { enabled: true, email: contact.email }
    : { enabled: false }
};
```

- [ ] **Step 2: Run tests — confirm all 37 pass now**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: 37 passed, 0 failed`

- [ ] **Step 3: Commit**

```bash
git add scripts/write-site-json.sh
git commit -m "feat: remove show_contact_link and contact.type from write-site-json.sh output"
```

---

### Task 5: Update base.njk

**Files:**
- Modify: `scaffold/src/_includes/base.njk`

- [ ] **Step 1: Remove the Contact nav link**

Find and remove this block (lines 27–29):

```nunjucks
{% if site.nav.show_contact_link and site.contact.enabled %}
  <li><a href="/contact/">Contact</a></li>
{% endif %}
```

- [ ] **Step 2: Update the footer to show the email link**

Replace:

```nunjucks
  <footer class="site-footer">
    <p>&copy; {{ site.name }}</p>
  </footer>
```

With:

```nunjucks
  <footer class="site-footer">
    <p>
      &copy; {{ site.name }}
      {% if site.contact.enabled %}
        &nbsp;·&nbsp; <a href="mailto:{{ site.contact.email }}">{{ site.contact.email }}</a>
      {% endif %}
    </p>
  </footer>
```

- [ ] **Step 3: Verify the build still works**

```bash
SITE_DIR=sites/ndig bash scripts/write-site-json.sh && \
SITE_DIR=sites/ndig bash scripts/apply-theme.sh && \
SITE_DIR=sites/ndig bash scripts/build-site.sh
```

Expected: `✓ Build complete. 3 HTML file(s) in sites/ndig/dist/`

- [ ] **Step 4: Spot-check the footer in the built output**

```bash
grep -A3 "site-footer" sites/ndig/dist/index.html
```

Expected: footer contains `ndig@nopolabs.com` as a mailto link (since ndig has `contact.enabled: true`).

- [ ] **Step 5: Commit**

```bash
git add scaffold/src/_includes/base.njk
git commit -m "feat: move contact from nav page to footer email link in base.njk"
```

---

### Task 6: Update /build command

**Files:**
- Modify: `.claude/commands/build.md`

- [ ] **Step 1: Remove the contact.njk auto-generation section**

Find and remove this entire block:

```markdown
**If `contact.enabled = true`**, also write `sites/<site-name>/src/contact.njk`:

```nunjucks
---
layout: base.njk
pageTitle: Contact
permalink: /contact/
---
<section class="contact-section">
  <h1>Get in Touch</h1>
  <p>Reach us at: <a href="mailto:{{ site.contact.email }}">{{ site.contact.email }}</a></p>
</section>
```
```

- [ ] **Step 2: Verify the file looks correct — confirm contact.njk section is gone**

```bash
grep -c "contact.njk" .claude/commands/build.md
```

Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/build.md
git commit -m "feat: remove auto-generated contact.njk from /build command"
```

---

### Task 7: Update /plan command

**Files:**
- Modify: `.claude/commands/plan.md`

- [ ] **Step 1: Remove contact.type from the schema template**

Find:

```json
  "contact": {
    "enabled": "<true or false from spec>",
    "type": "email",
    "email": "<email from spec, or omit key if contact.enabled is false>"
  },
```

Replace with:

```json
  "contact": {
    "enabled": "<true or false from spec>",
    "email": "<email address, or omit key if contact.enabled is false>"
  },
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/plan.md
git commit -m "feat: remove contact.type from /plan build-plan.json schema"
```

---

### Task 8: Update /interview command

**Files:**
- Modify: `.claude/commands/interview.md`

- [ ] **Step 1: Update question 10**

Find:

```
10. Do you want a contact method on the site? If yes, what email address should visitors use? *(Visitors get a mailto link. A submittable contact form is a v2 feature — not yet available.)*
```

Replace with:

```
10. Do you want a contact email shown in the site footer? If yes, what address should visitors use? *(A mailto link will appear in every page's footer. A contact page or submittable form can be added as a page — just include "Contact" in your page list.)*
```

- [ ] **Step 2: Remove nav.show_contact_link from the spec schema**

Find:

```json
  "nav": {
    "order": ["page-id-1", "page-id-2"],
    "show_contact_link": true
  },
```

Replace with:

```json
  "nav": {
    "order": ["page-id-1", "page-id-2"]
  },
```

- [ ] **Step 3: Remove contact.type from the spec schema and rules**

Find:

```json
  "contact": {
    "enabled": true,
    "type": "email",
    "email": "address@example.com"
  },
```

Replace with:

```json
  "contact": {
    "enabled": true,
    "email": "address@example.com"
  },
```

Find and remove these two rules:

```
- `contact.type` is always `"email"` in v1 (a submittable form is a v2 feature)
- If `contact.enabled = false`, set `type: "email"` and `email: ""`
```

Replace with:

```
- If `contact.enabled = false`, omit `email` or set it to `""`
```

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/interview.md
git commit -m "feat: update /interview — contact becomes footer email, remove nav.show_contact_link and contact.type"
```

---

### Task 9: Update ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update the contact form pending entry**

Find:

```markdown
### Contact form + form backend

v1 contact is a `mailto:` link only. v2 adds a real submittable contact form.
Because Clodsite sites are static, a form needs a backend to receive the POST —
either a form service (Formspree, Web3Forms) or a Cloudflare Pages Function
that handles the submission and sends email via an API (Resend, MailChannels).
The spec's `contact.type` field is reserved for this.
```

Replace with:

```markdown
### Contact form + form backend

Contact is a footer email link (`contact.enabled` / `contact.email` in the
spec). A submittable contact form would be a user-specified page in `pages[]`
— built using either a form service (Formspree, Web3Forms) or a Cloudflare
Pages Function with an email API (Resend, MailChannels). The interview would
ask for the preferred approach and `/build` would generate the page and form
markup accordingly.
```

- [ ] **Step 2: Run the full test suite one final time**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: 37 passed, 0 failed`

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: update contact form roadmap entry — form is a user-specified page"
```

---

## Self-Review

**Spec coverage:**
- ✓ `nav.show_contact_link` removed from spec schema, write-site-json, fixtures, interview
- ✓ `contact.type` removed from spec schema, validate-spec, write-site-json, fixtures, plan, interview
- ✓ `base.njk` footer updated with conditional email link
- ✓ Contact nav link removed from base.njk
- ✓ Auto-generated `contact.njk` removed from build command
- ✓ ROADMAP updated
- ✓ Tests added for deprecated field absence (TDD: failing before fix, passing after)
- ✓ Migration: existing specs with old fields are not broken (extra fields ignored by scripts)

**Placeholder scan:** No TBDs, no "implement later". All code blocks are complete.

**Type consistency:** `site.contact.enabled` and `site.contact.email` used consistently in base.njk and write-site-json.sh. `contact.enabled` / `contact.email` used consistently across all command files.
