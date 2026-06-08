# Turnstile Protection for `resend-form` — Design

**Date:** 2026-06-08
**Status:** Implemented
**Related roadmap entry:** "General Pages Functions, secrets, and Turnstile support"
**Extends:** `docs/superpowers/specs/2026-06-02-resend-form-component-design.md`

---

## Background

The shipped `resend-form` component exposes `/api/contact` as a public
Cloudflare Pages Function. The Function validates configured fields before
calling Resend, but it cannot distinguish a person from an automated client.
Repeated automated submissions can consume Resend quota and damage sender
reputation.

Cloudflare Turnstile protects the form with two required operations:

1. A browser widget produces a short-lived, single-use token.
2. The Pages Function validates that token with Cloudflare's Siteverify API
   before calling Resend.

The existing Pages Function is already the correct server-side enforcement
point. Clodsite will not deploy a second verification Worker.

The product goal is an optional build-plan capability whose Cloudflare
provisioning is automatic once the operator has supplied a token with the
required account permissions.

---

## Goals

- Allow a `resend-form` component to opt into Turnstile with one boolean field.
- Keep Turnstile site keys and secret keys out of `build-plan.yaml`.
- Keep the Turnstile secret out of generated files, logs, command arguments,
  and version control.
- Create or reuse one managed Turnstile widget per Clodsite site.
- Restrict the widget to the Pages production hostname and configured custom
  domain.
- Validate every Turnstile token server-side before calling Resend.
- Make repeated deployments idempotent.
- Preserve the current unprotected `resend-form` behavior when Turnstile is
  disabled.
- Keep local builds deterministic and free of Cloudflare API side effects.

## Non-goals

- General CAPTCHA support for arbitrary components.
- Rate limiting, WAF rules, Bot Management, or pre-clearance.
- A standalone Turnstile verification Worker.
- Multiple `resend-form` endpoints in one site.
- Invisible or non-interactive widget modes.
- User-configurable Turnstile themes, sizes, retries, or callback behavior.
- Automatic deletion of widgets during site teardown in this increment.
- Secret rotation.

---

## Build-plan Contract

`resend-form` gains one optional field:

```yaml
- type: resend-form
  to: hello@example.com
  from: noreply@example.com
  turnstile: true
  fields:
    - { name: name, label: Name, type: text, required: true }
    - { name: email, label: Email, type: email, required: true }
    - { name: message, label: Message, type: textarea, required: true }
```

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `turnstile` | boolean | `false` | Require a valid Turnstile token before email delivery |

The build plan expresses intent only. It never contains a site key, secret,
widget ID, hostname list, or Cloudflare account identifier.

---

## Mental Model

### Build

```text
build-plan.yaml
      |
      +-- turnstile: false --> current form and Function
      |
      `-- turnstile: true
              |
              +-- HTML contains a deploy-time site-key marker
              `-- Function contains a deploy-time hostname marker
```

The normal build remains offline. It does not create Cloudflare resources.

### Deploy

```text
ensure Pages project
      |
      v
read actual Pages production subdomain
      |
      v
create or reuse Turnstile widget
      |
      +-- update allowed hostnames if configuration changed
      +-- push TURNSTILE_SECRET_KEY to Pages via stdin
      +-- inject public site key into built HTML
      `-- inject expected hostnames into generated Function
              |
              v
deploy Pages site and Function
```

### Submission

```text
browser widget -> token
      |
      v
POST /api/contact
      |
      v
Pages Function -> Siteverify
      |
      +-- reject invalid token, action, or hostname
      `-- call Resend only after successful verification
```

---

## Component Rendering

When `turnstile` is `true`, `component.njk` shall:

- load `https://challenges.cloudflare.com/turnstile/v0/api.js` with `async`
  and `defer`;
- render one implicit widget inside the form;
- set `data-sitekey` to the exact marker
  `__CLODSITE_TURNSTILE_SITEKEY__`;
- set `data-action="clodsite-contact"`;
- preserve the existing submit, success, and error states;
- include the generated `cf-turnstile-response` hidden field in the existing
  form-element serialization;
- reset the widget after a failed submission when `window.turnstile` exists.

When `turnstile` is absent or `false`, the template shall emit no Turnstile
script, widget, marker, or token field.

The marker is intentionally invalid until deployment. A protected production
site must never be deployed while the marker remains.

---

## Function Enforcement

`render-functions.sh` shall add this metadata to generated Function config:

```javascript
turnstile: {
  enabled: true,
  action: "clodsite-contact",
  hostnames: "__CLODSITE_TURNSTILE_HOSTNAMES__"
}
```

The quoted marker keeps the generated Function valid JavaScript before
deployment. Provisioning replaces the complete JSON string
`"__CLODSITE_TURNSTILE_HOSTNAMES__"` with a JSON array.

For an unprotected form:

```javascript
turnstile: {
  enabled: false
}
```

When enabled, `function.template.js` shall:

1. Require `TURNSTILE_SECRET_KEY`.
2. Require a non-empty `cf-turnstile-response` string.
3. POST `secret`, `response`, and the request's `CF-Connecting-IP` value to
   `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
4. Reject network failures or non-JSON Siteverify responses.
5. Require `success === true`.
6. Require `action === "clodsite-contact"`.
7. Require `hostname` to be one of the deployed hostnames.
8. Exclude `cf-turnstile-response` from the email body.
9. Call Resend only after all Turnstile checks succeed.

All Turnstile failures return HTTP `400` with:

```json
{ "ok": false, "error": "Verification failed" }
```

Configuration failures return HTTP `500` with:

```json
{ "ok": false, "error": "Not configured" }
```

Siteverify details and error codes are not returned to the browser.

---

## Provisioning

### Script

Add `scripts/provision-turnstile.sh`. `deploy.sh` invokes it after ensuring the
Pages project exists and before pushing secrets or deploying.

The script is a no-op when the first `resend-form` does not have
`turnstile: true`.

### Required credentials

The existing `CLOUDFLARE_API_TOKEN` must grant:

- Pages read/write access for the selected account;
- Turnstile Sites read/write, shown in the dashboard as
  `Account > Turnstile > Edit`.

No dashboard interaction is required after those permissions exist.

### Widget identity

The deterministic widget name is:

```text
clodsite:<site-slug>:resend-form
```

The script stores only this non-secret state in
`${SITE_DIR}/.turnstile-state.json`:

```json
{
  "sitekey": "0x...",
  "widget_name": "clodsite:example:resend-form"
}
```

The sites repository ignores `*/.turnstile-*`.

On each deploy:

1. If state contains a site key, fetch that widget directly.
2. Otherwise list widgets and find the exact deterministic name.
3. If no match exists, create a managed widget with
   `clearance_level: "no_clearance"`.
4. If exactly one match exists, reuse it and write its public site key to
   state.
5. If multiple exact-name matches exist, abort without choosing one.
6. Fetch widget details to obtain the current secret.
7. Update the widget with `PUT` when its mode, clearance level, name, or domain
   set differs from the desired configuration.

### Domains

The desired domain set is:

- the Pages project's actual `subdomain`, fetched from
  `GET /accounts/{account}/pages/projects/{project}`;
- `custom_domain` from `build-plan.yaml`, when non-empty.

The script does not assume `${slug}.pages.dev`, because Cloudflare may assign a
suffixed subdomain when a name is already taken.

Localhost is not added to the production widget. Automated tests use
Cloudflare's published Turnstile test keys.

### Secret handling

The widget detail response contains the secret. The provisioning script shall:

- retain the response and secret only in process memory;
- never echo the secret;
- never write the secret to a file;
- send it through stdin to:

```bash
wrangler pages secret put TURNSTILE_SECRET_KEY --project-name "$SITE_NAME"
```

A failed API call, widget update, secret push, or artifact injection aborts the
deployment.

---

## Artifact Injection

Provisioning replaces:

- every `__CLODSITE_TURNSTILE_SITEKEY__` marker under `${SITE_DIR}/dist/` with
  the public site key;
- the complete quoted `"__CLODSITE_TURNSTILE_HOSTNAMES__"` value in
  `${SITE_DIR}/functions/api/contact.js` with a JSON array.

The script must fail when:

- protected artifacts contain neither marker;
- either marker remains after replacement;
- an unprotected build unexpectedly contains either marker.

The generated Function remains outside `dist/`, matching the existing Pages
Functions convention.

---

## Deployment and MCP Behavior

The CLI deployment remains:

```text
build -> deploy
```

`deploy.sh` performs the provisioning and artifact injection. It then pushes
`RESEND_API_KEY` and deploys the already-built site.

The MCP `deploy_site` pipeline needs no new public argument. It already runs
`build-site.sh` followed by `deploy.sh`; protected plans are provisioned during
that deploy step.

If the API token lacks Turnstile permission, both CLI and MCP deployments fail
at the `deploy` step with an error that names the missing
`Account > Turnstile > Edit` permission.

---

## User Action

User action is required only to create or refresh a Cloudflare API token with
the necessary account permissions and, when one token covers multiple
accounts, select `CLOUDFLARE_ACCOUNT_ID`.

Widget creation, updates, site-key injection, secret installation, and
deployment are automated.

---

## Warnings and Next Steps

The current no-bot-protection warning remains only when a generated contact
Function is unprotected.

For a protected form, `deploy-finalize.sh` shall instead add a short
confirmation that Turnstile is enabled and identify the protected endpoint.

---

## Testing

Automated tests shall cover:

- schema acceptance and rejection for the boolean field;
- protected and unprotected component rendering;
- protected Function config and enforcement;
- malformed, missing, failed, wrong-action, and wrong-hostname tokens;
- proof that Resend is not called after failed verification;
- successful Siteverify followed by Resend;
- widget create, reuse, update, and ambiguous-name failure;
- actual Pages subdomain discovery;
- secret delivery through stdin without logging;
- site-key and hostname marker replacement;
- failure when markers are absent or remain;
- no-op provisioning for unprotected forms;
- deploy failure with missing Turnstile permission;
- conditional `NEXT-STEPS.md` messaging;
- MCP deployment ordering.

Network tests use fake Cloudflare and Wrangler commands. A documented smoke
test uses Cloudflare's published testing site key and testing secret.

---

## Security Considerations

- Siteverify is mandatory and always precedes Resend.
- The private secret exists only in Cloudflare and process memory.
- The public site key is safe to embed in HTML and cache locally.
- Expected action and hostname are checked in addition to `success`.
- The widget is restricted to known production hostnames.
- An attacker cannot select the email recipient, sender, subject, or fields.
- Turnstile is abuse resistance, not rate limiting; rate limiting remains a
  separate future capability.

---

## Documentation Sources

- [Turnstile widget management API](https://developers.cloudflare.com/turnstile/get-started/widget-management/api/)
- [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Turnstile client-side rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)
- [Cloudflare Pages project API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/get/)
