# Explicit Redirects Design

**Date:** 2026-06-26
**Status:** Implemented
**Roadmap entry:** Explicit redirects (pending item 9)

---

## Summary

When a page is renamed or retired, its old URL should send visitors (and search
engines) to the new location with a real HTTP redirect — not a soft 404. Today
Clodsite has no way to express that: a removed page's URL falls through to the
generated `dist/404.html` (item 8), which is correct for *genuinely unknown*
paths but wrong for a path we know moved.

Add an optional top-level `redirects` block to `build-plan.yaml` and generate a
Cloudflare Pages [`_redirects`](https://developers.cloudflare.com/pages/configuration/redirects/)
file. This is the redirect sibling of the existing `headers` → `_redirects`
parallels `_headers`: same shape of feature (a declarative top-level list, a
deterministic render step, no inference), different Cloudflare artifact.

Genuinely unknown paths still hit the 404. Redirects only cover paths we
deliberately declare.

## Contract

```yaml
redirects:                 # optional, top-level; non-empty when present
  - from: /old-pricing     # origin-relative request path that should redirect
    to: /pricing           # destination: origin-relative path or https:// URL
    status: 301            # optional; default 301
  - from: /promo
    to: https://example.org/landing
    status: 302
```

- `from` — required. An **origin-relative request path**: starts with `/`, not
  `//`, no `..`, single-line, no whitespace. This is the path the visitor
  requested. v1 is **literal paths only** — no `*` splats or `:placeholder`
  captures (deferred; keeps validation tight and the contract obvious).
- `to` — required. Either an origin-relative path (`/...`, not `//`) or an
  absolute `https://` URL (redirect off-site). Single-line, no whitespace.
- `status` — optional integer, default **301**. Allowed: `301` (permanent),
  `302`/`303`/`307` (temporary), `308` (permanent, method-preserving). A bare
  list entry with no `status` is the common "page moved permanently" case.

### Rules

- At most 100 redirects (matches the `headers` cap).
- **No duplicate `from`** — the first match wins in Cloudflare, so a second rule
  for the same source is dead; reject it as an authoring error.
- **No conflict with a generated page route.** A redirect whose `from` resolves
  to a real page is shadowed — Cloudflare Pages serves the existing asset and
  the redirect never fires. The generated routes are computed with the same rule
  the site uses: a page is `/` when its `id` is `home` or it is `nav.order[0]`,
  else `/<id>/`; plus the reserved `/404.html`. Comparison ignores a trailing
  slash, so `from: /about` and `from: /about/` both conflict with the `about`
  page. `from: /` (the home route) is always rejected.
- `from` and `to` must not be equal (a no-op / loop).

## Rendering

A new `[SCRIPT]` step, `render-redirects.sh`, mirrors `render-headers.sh`: it
reads `plan.redirects` and writes `dist/_redirects`, one rule per line in
Cloudflare's `FROM  TO  STATUS` format:

```
/old-pricing  /pricing  301
/promo  https://example.org/landing  302
```

- When `redirects` is absent or empty, any stale `dist/_redirects` is removed
  (same self-healing behavior `render-headers.sh` has for `_headers`).
- Runs in the build pipeline after `build-site` (it writes into `dist/`),
  alongside `render-headers`. Added to `build-deploy.sh` and the `/build` and
  `/deploy` step lists in `CLAUDE.md`.

The generator is deterministic and does no validation of its own — the plan has
already passed `validate-plan` by the time it runs (same contract as
`render-headers.sh`).

## Validation

`validate-plan.mjs` gains a `redirects` block check, structured like the
existing `headers` block: array shape and cap, per-rule allowed fields
(`from`, `to`, `status`), the `from`/`to`/`status` rules above, duplicate-`from`
detection, and the generated-route conflict check (reusing the page-route rule
already used for nav hrefs and the not-found page links). Validation failures
are reported per rule (`redirects[2].to must begin with / or https://`) so the
authoring agent can fix them precisely.

## Testing

- `validate-plan` (run-tests negative mutations): bad `from` (relative, `//`,
  `..`, whitespace, splat), bad `to`, out-of-range/duplicate `status`, duplicate
  `from`, `from` == `to`, and a `from` that collides with a real page route and
  with `/`.
- `render-redirects`: a plan with redirects writes `dist/_redirects` with the
  expected `FROM TO STATUS` lines and default-301 when `status` is omitted; a
  plan without redirects removes a pre-existing `_redirects`.
- Full build integration: a fixture site with a couple of redirects builds and
  ships `dist/_redirects`; the 404 still covers undeclared paths.

## Follow-ups

- `*` splats and `:placeholder` captures (Cloudflare supports them) if a real
  need appears — e.g. retiring a whole path prefix.
- Optional `200` (rewrite) and `404` rules — out of scope; this item is about
  honest redirects for moved/retired pages.
