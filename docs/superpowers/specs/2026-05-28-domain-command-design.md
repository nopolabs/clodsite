# `/domain` Command — Design Spec

**Date:** 2026-05-28
**Status:** Approved for implementation

---

## Problem

After `/deploy`, sites with a custom domain (`domain.custom: true` in the spec) require manual steps: add the domain in the Cloudflare Pages dashboard, then separately create a CNAME in DNS. Cloudflare does not auto-create the DNS record even when the domain is managed in the same account. The result is a 522 error until the user completes both steps manually.

---

## Goal

A `/domain <site-name>` command that wires a custom domain to a deployed Pages project automatically — adding the Pages domain association and creating the CNAME via the Zones API when DNS is Cloudflare-managed. For external DNS or missing token permissions, it falls back gracefully to printing the exact record for manual entry.

---

## Architecture: `[HYBRID]`

LLM handles the conversational/semantic parts (prompt for domain if missing, update spec, interpret errors). A new `scripts/domain.sh` handles all Cloudflare API calls.

---

## Command Flow

```
[LLM]    Get site name from args — if missing, prompt and stop
[SCRIPT] bash scripts/migrate-site.sh
[LLM]    Read sites/<name>/site-spec.json
         — if domain.custom = false or hostname is empty:
             prompt "What domain or subdomain should this site use?"
             write to spec: domain.custom = true, hostname = answer
         — if meta.deployed_url is missing:
             tell user to run /deploy <name> first and stop
[SCRIPT] SITE_DIR=sites/<name> bash scripts/domain.sh
[LLM]    Interpret output or errors
```

---

## `scripts/domain.sh`

### Inputs

- `SITE_DIR` env var (set by command)
- `.env` (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)
- `${SITE_DIR}/site-spec.json` — provides:
  - `domain.hostname` (e.g., `ndig.nopolabs.com`)
  - `meta.deployed_url` (e.g., `https://ndig.pages.dev`) — CNAME target
  - `site.name` → slugified → Pages project name

### Logic

1. **Extract apex domain** from hostname (`ndig.nopolabs.com` → `nopolabs.com`)
2. **Check zone ownership** — `GET /zones?name={apex}`:
   - 403 → token lacks `Zone:Read`; fall through to manual path with warning
   - 200, result non-empty → Cloudflare-managed DNS; capture `zone_id`
   - 200, result empty → external DNS; skip to step 4
3. **Add Pages domain association** — `POST /accounts/{id}/pages/projects/{slug}/domains` with `{"name": "{hostname}"}`:
   - 200/201 → success
   - 409 → already configured; treat as success
4. **Create CNAME (Cloudflare-managed only)** — `POST /zones/{zone_id}/dns_records` with `{"type":"CNAME","name":"{name}","content":"{pages_dev_host}","proxied":true}`:
   - `name` is the subdomain label (e.g., `ndig`) or `@` for a root domain
   - 200/201 → success
   - 403 → token lacks `Zone:DNS:Edit`; fall through to manual path with warning
   - Duplicate record error → treat as success

### Outputs

**Cloudflare-managed, full automation:**
```
✓ Pages domain association added
✓ CNAME created: ndig.nopolabs.com → ndig.pages.dev (proxied)
SSL certificate will provision within ~1 minute.
```

**External DNS (or token lacks DNS Edit):**
```
[Warning: token lacks Zone > DNS: Edit — cannot create CNAME automatically.]
✓ Pages domain association added.
Add this record at your DNS provider (or in Cloudflare DNS dashboard):
  Type:   CNAME
  Name:   ndig            (or @ for root domain)
  Target: ndig.pages.dev
  Proxy:  enable if your provider supports it

[To enable full automation: add Zone > DNS: Edit to your token at
dash.cloudflare.com → API Tokens, then re-run /domain <site-name>.]
```
(Warning and re-run note only shown when falling back due to missing permission.)

---

## `/setup` Changes

Add `Zone > DNS: Edit` to the token permission list with a note: "needed by `/domain` to create CNAME records for custom domains automatically."

---

## `NEXT-STEPS.template.md` Changes

Replace the manual "Set up a custom domain" section with:

```markdown
## Connect a custom domain

Run `/domain {{SITE_NAME}}` to connect a custom domain to this site.
Clodsite will add the Pages domain association and — if your DNS is managed
in Cloudflare — create the CNAME automatically. For external DNS providers
it prints the exact record to add at your registrar.
```

---

## Files Created / Modified

| File | Change |
|------|--------|
| `scripts/domain.sh` | New — all Cloudflare API calls |
| `.claude/commands/domain.md` | New — command definition |
| `.claude/commands/setup.md` | Add `Zone > DNS: Edit` to token instructions |
| `scripts/templates/NEXT-STEPS.template.md` | Replace manual domain section |
| `scripts/test/run-tests.sh` | Add domain.sh unit tests |

---

## Testing

### Automated (`run-tests.sh`)

- Missing `SITE_DIR` → exits 1
- Missing `.env` → exits 1
- Spec with no `meta.deployed_url` → exits 1
- Apex extraction: `ndig.nopolabs.com` → `nopolabs.com`, `mysite.com` → `mysite.com`

### Manual Checklist

- [ ] `/domain ndig` with Cloudflare-managed zone → CNAME created, site resolves at custom domain
- [ ] `/domain` with token lacking `Zone > DNS: Edit` → warning shown, Pages association still added, CNAME record printed
- [ ] `/domain` with external DNS hostname → correct CNAME record printed, no Zones API call attempted
- [ ] `/domain` run twice (idempotent) → 409s treated as success, clean output

---

## What Does Not Change

- `/deploy` — unchanged; domain wiring is a separate explicit step
- Spec schema — `domain.hostname` and `domain.custom` fields already exist
- `/interview` — still collects domain info; `/domain` fills it in interactively if missing
