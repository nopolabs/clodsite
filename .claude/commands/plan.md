Generate a Clodsite `build-plan.yaml` from a legacy `site-spec.json`.

This command is a scaffolding bridge from the original interview/spec workflow.
The current Clodsite contract is `$SITES_DIR/<site-name>/build-plan.yaml`; an AI
agent may produce that file directly from a customer conversation, brief, source
documents, existing copy, or any other collaboration path. Use `/plan` when a
valid `site-spec.json` already exists and the user wants it converted into the
build contract.

---

**Get site name.** Look at what the user typed after `/plan`. If no site name was provided:

> "Please provide a site name: `/plan <site-name>` — e.g., `/plan acme-corp`"

And stop.

---

**[SCRIPT]** Validate the spec:

```bash
SITE_NAME=<site-name> bash scripts/validate-spec.sh
```

If this exits with errors, print them clearly to the user and stop. Do not proceed until the spec is valid. The user can edit `$SITES_DIR/<site-name>/site-spec.json` directly or re-run `/interview <site-name>`.

---

**[SCRIPT]** Generate the component catalog reference:

```bash
bash scripts/generate-catalog-md.sh
```

---

**[LLM]** Read `$SITES_DIR/<site-name>/site-spec.json`. Generate `$SITES_DIR/<site-name>/build-plan.yaml` using the Write tool.

The YAML must match this schema exactly after finalization:

```yaml
slug: <site directory name — same as what was passed to /plan, e.g. acme-corp>
name: <display name injected from site-spec.json by finalize-plan.sh>
overview: >-
  <one paragraph — purpose, audience, tone>
style: <value of site.style from spec>
tone: <value of site.tone from spec>
custom_domain: <optional hostname only, e.g. www.example.com, or "">
head: <optional site-wide metadata defaults>
  description: <concise default search and sharing description>
  image: <optional social sharing image>
    src: <site-root path or absolute https:// URL>
    alt: <accessible image description>
pages:
  - id: <page id>
    title: <page title>
    head: <optional page-specific description and/or image overrides>
    components:
      - type: <component name from components/CATALOG.md>
        # ... required and optional fields per the component's schema
nav:
  order:
    - <page ids in nav order from spec>
contact:
  enabled: <true or false from spec>
  email: <email address — omit this key if contact.enabled is false>
headers: <optional Cloudflare Pages static response-header rules>
  - path: /*
    values:
      X-Content-Type-Options: nosniff
```

Do not include a `name` field — the display name is injected automatically by `finalize-plan.sh` after this step.

**Content rules for `pages[n].components`:**

Read `components/CATALOG.md` first — it lists every available component type
and its required/optional fields. You MUST only use component types listed
there. `validate-plan.sh` will reject unknown types.

The default and most common component is `prose`, which accepts a `markdown`
field containing GFM (headings, paragraphs, lists, links, fenced code blocks,
tables). A page whose body is purely textual is a single `prose` component.

Pages that need richer presentation (image gallery, contact form) compose
multiple components in order. Components stack vertically.

- If `content_status = "provided"`: use `content_outline` as-is inside a
  `prose` component's `markdown` field.
- If `content_status = "draft"`: write complete, publish-ready copy as GFM
  inside a `prose` component's `markdown` field. Match the site tone.
- Component fields use the appropriate YAML type (string, array, object) per
  the component's schema.

Use `head.description` for concise search and sharing copy. Add page-level
descriptions when pages have distinct purposes. Root-relative sharing images
become absolute when `custom_domain` is configured. Do not invent response
headers: include `headers` only when the site has an explicit policy.

Write the complete YAML to `$SITES_DIR/<site-name>/build-plan.yaml`. No extra commentary in the file.

---

**[SCRIPT]** Finalize the plan — injects display name from the spec and validates:

```bash
SITE_NAME=<site-name> bash scripts/finalize-plan.sh
```

If this exits with errors, print them clearly and stop.

---

Tell the user: "Review `$SITES_DIR/<site-name>/build-plan.yaml` — this is the build contract. Check the page content, component structure, navigation, style, and contact settings. When ready, run `/build <site-name>`."
