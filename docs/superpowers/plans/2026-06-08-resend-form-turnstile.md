# Turnstile Protection for `resend-form` — Implementation Plan

> Execute this plan task by task. Do not begin a later task until the current
> task's tests pass. Preserve unrelated working-tree changes.

**Goal:** Add optional, automatically provisioned Cloudflare Turnstile
protection to `resend-form` without exposing keys in `build-plan.yaml` or
adding Cloudflare side effects to the build command.

**Architecture:** `turnstile: true` causes rendering to emit deploy-time
markers for the public site key and expected hostnames. `deploy.sh` ensures the
Pages project exists, then calls a new idempotent provisioning script. That
script creates or reuses a managed widget, obtains the actual Pages subdomain,
updates widget domains, pushes the secret to Pages through stdin, and replaces
the markers. The existing Pages Function calls Siteverify directly before
Resend.

**Approved design:**
[`docs/superpowers/specs/2026-06-08-resend-form-turnstile-design.md`](../specs/2026-06-08-resend-form-turnstile-design.md)

**Tech stack deviation:** This repository uses Bash, Node.js, Nunjucks,
Eleventy, Cloudflare Pages Functions, Wrangler, and Cloudflare REST APIs. It
does not use the generic Vue/AWS stack.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `components/resend-form/schema.json` | Modify | Add optional boolean `turnstile` |
| `components/resend-form/component.njk` | Modify | Render widget, script, action, and site-key marker |
| `components/resend-form/component.css` | Modify | Add scoped widget spacing |
| `components/resend-form/function.template.js` | Modify | Validate Turnstile before Resend |
| `scripts/render-functions.sh` | Modify | Emit Turnstile config and hostname marker |
| `scripts/provision-turnstile.sh` | Create | Create/reuse/update widget, push secret, inject artifacts |
| `scripts/deploy.sh` | Modify | Invoke provisioning after Pages project creation |
| `scripts/deploy-finalize.sh` | Modify | Warn only for unprotected forms; confirm protected forms |
| `scripts/setup.sh` | Modify | Ignore `.turnstile-*` site state |
| `scripts/test/fixtures/valid-build-plan-resend-turnstile.yaml` | Create | Exercise protected form without changing the unprotected fixture |
| `scripts/test/run-tests.sh` | Modify | Add schema, rendering, Function, provisioning, and deploy tests |
| `mcp/pipeline.test.js` | Modify | Assert protected deploy remains in the existing pipeline |
| `components/CATALOG.md` | Regenerate | Publish the new optional field |
| `ROADMAP.md` | Modify | Mark Resend complete and narrow the remaining general Functions item |
| `CLAUDE.md` | Modify | Document automatic Turnstile provisioning and token scope |

---

## Task 1: Extend the Component Contract

### Tests first

Add validator tests proving:

- `turnstile: true` passes;
- `turnstile: false` passes;
- string, number, object, and null values fail;
- omission preserves the current valid fixture behavior.

Add catalog assertions for the optional field and its description.

### Implementation

Add `"turnstile": "boolean"` to the schema's optional fields. Update its
description and example to state that deployment requires
`Account > Turnstile > Edit`.

Regenerate `components/CATALOG.md`.

### Gate

Run:

```bash
bash scripts/test/run-tests.sh
```

Expected: all tests pass.

---

## Task 2: Render the Protected Form

### Tests first

Build protected and unprotected fixtures and assert:

- protected HTML contains the Turnstile API script exactly once;
- protected HTML contains `class="cf-turnstile"`;
- protected HTML contains the exact site-key marker;
- protected HTML contains `data-action="clodsite-contact"`;
- unprotected HTML contains none of those values;
- the existing form still posts to `/api/contact`;
- error handling calls `turnstile.reset` only when available.

### Implementation

Conditionally render:

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async defer></script>
<div class="cf-turnstile"
     data-sitekey="__CLODSITE_TURNSTILE_SITEKEY__"
     data-action="clodsite-contact"></div>
```

Keep all interpolated build-plan values escaped. Add neutral scoped spacing in
`component.css`. Do not expose layout controls.

### Gate

Run the component render/build section and then the full shell suite.

---

## Task 3: Enforce Siteverify in the Pages Function

### Tests first

Execute a generated `.mjs` Function with stubbed `fetch` and assert:

1. Missing `TURNSTILE_SECRET_KEY` returns `500`.
2. Missing token returns `400`.
3. Siteverify network failure returns `400`.
4. Siteverify `success: false` returns `400`.
5. Wrong action returns `400`.
6. Wrong hostname returns `400`.
7. Every failure makes zero Resend calls.
8. A valid token causes exactly one Resend call.
9. The Turnstile token is absent from the email body.
10. An unprotected form never calls Siteverify.

### Implementation

Update generated config with:

```javascript
turnstile: {
  enabled: true,
  action: "clodsite-contact",
  hostnames: "__CLODSITE_TURNSTILE_HOSTNAMES__"
}
```

Provisioning replaces the complete quoted marker with a JSON array. Keeping
the marker quoted ensures the generated Function passes `node --check` before
deployment.

Add a small `verifyTurnstile` helper in the Function template. It posts JSON to
Siteverify with the secret, token, and `CF-Connecting-IP`.

Keep the public error stable as `"Verification failed"`. Do not expose
Siteverify error codes.

### Gate

Run `node --check` against generated Function output and run the full shell
suite.

---

## Task 4: Implement Idempotent Provisioning

### Script interface

Create executable `scripts/provision-turnstile.sh`.

Inputs:

- `SITE_DIR`
- repository `.env`
- generated `dist/`
- generated `functions/api/contact.js`

Output:

- human-readable progress with no secrets;
- `${SITE_DIR}/.turnstile-state.json` containing only site key and widget name.

Exit `0` without API calls when Turnstile is disabled.

### Tests first

Use fake `curl` and `wrangler` executables and fixture JSON to cover:

- missing API token;
- missing account ID;
- Pages project lookup failure;
- new widget creation;
- state-based widget reuse;
- exact-name discovery when state is absent;
- ambiguous exact-name failure;
- domain update with `PUT`;
- actual Pages subdomain plus optional custom domain;
- secret push through stdin;
- no secret in stdout, stderr, state, or command log;
- site-key marker replacement in all built HTML;
- hostname marker replacement in the Function;
- missing and remaining marker failures;
- no-op behavior when disabled.

### Implementation details

Use Cloudflare API endpoints:

```text
GET  /accounts/{account}/pages/projects/{project}
GET  /accounts/{account}/challenges/widgets
GET  /accounts/{account}/challenges/widgets/{sitekey}
POST /accounts/{account}/challenges/widgets
PUT  /accounts/{account}/challenges/widgets/{sitekey}
```

Use the exact widget name:

```text
clodsite:<slug>:resend-form
```

Desired widget settings:

```json
{
  "mode": "managed",
  "clearance_level": "no_clearance"
}
```

Parse API responses with Node.js, not regular expressions. Verify Cloudflare's
top-level `success` value and surface API error messages without printing the
response object containing the widget secret.

Send the secret only through stdin to Wrangler, then unset shell variables
holding API detail responses and the secret.

### Gate

Run provisioning tests, `bash -n scripts/provision-turnstile.sh`, ShellCheck if
available, and the full shell suite.

---

## Task 5: Integrate Deployment and Finalization

### Tests first

Extend the fake-Wrangler deploy tests to assert:

- provisioning runs after Pages project creation and before secret pushes;
- provisioning failure prevents Resend secret push and deployment;
- protected deploy pushes both `TURNSTILE_SECRET_KEY` and `RESEND_API_KEY`;
- unprotected deploy pushes only `RESEND_API_KEY`;
- no unresolved Turnstile marker reaches `wrangler pages deploy`;
- protected `NEXT-STEPS.md` confirms Turnstile;
- unprotected `NEXT-STEPS.md` retains the bot-protection warning.

### Implementation

Call:

```bash
bash "${SCRIPT_DIR}/provision-turnstile.sh"
```

after project creation and before the existing Resend secret block.

Remove the unconditional deployment warning. Derive finalization messaging
from `build-plan.yaml` rather than searching mutable built HTML.

Update `scripts/setup.sh --init-sites` so newly created site repositories
ignore:

```gitignore
*/.turnstile-*
```

Do not overwrite existing `.gitignore` files. Document the one-line manual
addition for existing sites repositories.

### Gate

Run the full shell suite and inspect a fake deployment log for operation order.

---

## Task 6: MCP, Documentation, and Roadmap

### Tests

Assert that `mcp/pipeline.js` still executes:

```text
render-functions -> build-site -> deploy
```

No new MCP argument is added. A protected build plan is sufficient to trigger
provisioning inside `deploy.sh`.

### Documentation

Update `CLAUDE.md` with:

- the `turnstile: true` contract;
- required Cloudflare token permission;
- automatic provisioning behavior;
- the fact that local builds do not call Cloudflare.

Update `ROADMAP.md`:

- move Resend-backed contact form to Completed;
- record Turnstile-protected `resend-form` as completed when implementation
  ships;
- retain general Functions/secrets work for non-contact use cases.

### Gate

Run:

```bash
npm run test:mcp
bash scripts/test/run-tests.sh
git diff --check
```

---

## Task 7: Smoke Test

### Local deterministic smoke test

Use Cloudflare's published Turnstile testing site key and testing secret in an
isolated generated site. Verify:

- the widget script and test site key appear in built HTML;
- a dummy token reaches the local Pages Function;
- Siteverify accepts the test token;
- Resend is stubbed and called only after verification.

### Live smoke test

Run only when the configured API token has Pages and Turnstile edit access and
`RESEND_API_KEY` is available:

1. Deploy a disposable protected fixture.
2. Confirm the widget exists with the actual Pages hostname.
3. Confirm both Pages secrets exist by name without reading their values.
4. Load the deployed contact page.
5. Submit one test message.
6. Confirm success and receipt.
7. Confirm a direct request without a token returns `400`.

Do not delete or rotate a pre-existing widget during the smoke test.

---

## Final Verification

Before requesting review:

```bash
bash scripts/test/run-tests.sh
npm run test:mcp
bash -n scripts/*.sh
node --check mcp/pipeline.js
git diff --check
```

Report:

- exact test counts;
- whether live credentials permitted the smoke test;
- widget create/reuse result;
- Pages project and hostname used;
- any required token-scope change;
- confirmation that no secret was written to disk.
