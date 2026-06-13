Conduct the Clodsite site interview. You are helping someone build a website. Be conversational, professional, and efficient. Ask one question at a time and wait for the answer before proceeding.

`/interview` is an optional guided way to produce the build contract. It is not required — an AI agent may also produce `$SITES_DIR/<site-name>/build-plan.yaml` directly from a customer conversation, brief, source documents, existing copy, or any other collaboration path. The interview simply gives a structured discovery flow that ends in the same place: a complete, validated `build-plan.yaml`.

---

**Get site name.** Look at what the user typed after `/interview`. That word or slug is the site name. If they typed `/interview` with nothing after it, respond:

> "Please provide a site name: `/interview <site-name>` — e.g., `/interview acme-corp`"

And stop.

The site name must be a valid slug: lowercase letters, numbers, and hyphens only (e.g., `my-site`, `acme-corp`, `ndig`). If the user typed a name with spaces or capitals, suggest the lowercase-hyphenated version and ask them to confirm before continuing.

---

**[SCRIPT]** Confirm the site doesn't already exist:

```bash
SITE_NAME=<site-name> bash -c 'source scripts/lib/sites.sh && clodsite_init_site_dir && [ ! -d "$SITE_DIR" ] || echo "EXISTS"'
```

If it prints `EXISTS`, tell the user:

> "`$SITES_DIR/<site-name>/` already exists. Edit `$SITES_DIR/<site-name>/build-plan.yaml` directly or run `/build <site-name>` to continue it. Use `/setup clean <site-name>` to start over."

And stop.

---

**[SCRIPT]** Create the site directory:

```bash
SITE_NAME=<site-name> bash -c 'source scripts/lib/sites.sh && clodsite_init_site_dir && mkdir -p "$SITE_DIR/assets/favicons"'
```

---

**Shortcut:** If the user points you to an answers file (e.g. "read from docs/demo/interview-answers.md"), read that file and synthesize the plan directly from it — skip the interactive questions entirely.

---

**[LLM]** Ask the following questions in order. One at a time. The site name is already known (`<site-name>`) — do NOT ask question 1 again; start from question 2:

1. ~~What is the name of your site or brand?~~ *(already provided as `<site-name>`)*
2. In one sentence, what does this site do or offer?
3. Who is this site for?
4. What tone should the writing have? *(professional / casual / technical / friendly)*
5. What visual personality fits best? *(minimal / professional / bold)* — briefly describe each if they ask.
6. What pages do you need? List 1–5 page names. *(e.g., Home — or Home, About, Services, Contact)*
7. For each page you listed: what is the purpose of this page in one sentence?
8. Do you have copy ready for the pages, or should I draft it? *(provided / draft)*
9. *(If provided)* Please share the content for each page — paste it or describe it.
   *(If draft)* For each page, describe in a few sentences what it should say.
10. Do you want a contact email shown in the site footer? If yes, what address should visitors use? *(A mailto link will appear in every page's footer. A contact page or submittable form can be added as a page — just include "Contact" in your page list.)*
11. *(Optional)* Do you have a custom domain, or is a `*.pages.dev` URL fine for now?

---

**[SCRIPT]** Generate the component catalog reference so you author against the current component vocabulary:

```bash
bash scripts/generate-catalog-md.sh
```

**[LLM]** Read `components/CATALOG.md` before constructing component arrays. You MUST only use the component types listed there — `validate-plan.sh` rejects unknown types. Use the catalog's constrained communication patterns rather than inventing layout fields or raw HTML.

---

**[LLM] Confirm before writing.** Present a concise summary of what you will build — display name, slug, style, tone, the page list with one-line purposes, navigation order, and contact setting. Ask the user to confirm or correct it before you write any files.

---

**[LLM]** Once confirmed, write a complete `$SITES_DIR/<site-name>/build-plan.yaml` using the Write tool. This is the build contract — the inference boundary. The YAML schema:

```yaml
slug: <site directory name — same as <site-name>, e.g. acme-corp>
name: <human-readable display name — may differ from the slug>
overview: >-
  <one paragraph — purpose, audience, tone>
style: <minimal|professional|bold>
tone: <professional|casual|technical|friendly>
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
    - <page ids in nav order — must list every page id>
contact:
  enabled: <true or false>
  email: <email address — omit this key if contact.enabled is false>
headers: <optional Cloudflare Pages static response-header rules>
  - path: /*
    values:
      X-Content-Type-Options: nosniff
```

**Rules:**
- Write a complete plan — include both `slug` and the human-readable `name`.
- `pages[].id` must be lowercase, no spaces, hyphens only (e.g., `home`, `about`, `our-work`).
- `nav.order` must list every page id.
- If `contact.enabled` is false, omit the `email` key.
- If there is no custom domain, set `custom_domain: ""`.

**Content rules for `pages[n].components`:**

The default and most common component is `prose`, which accepts a `markdown`
field containing GFM (headings, paragraphs, lists, links, fenced code blocks,
tables). A page whose body is purely textual is a single `prose` component.
Pages that need richer presentation compose multiple components in order;
components stack vertically.

- If the user supplied copy: use it as-is inside a `prose` component's
  `markdown` field.
- If you are drafting: write complete, publish-ready copy as GFM inside a
  `prose` component's `markdown` field. Match the site tone.
- Component fields use the appropriate YAML type (string, array, object) per
  the component's schema.

Use `head.description` for concise search and sharing copy. Add page-level
descriptions when pages have distinct purposes. Root-relative sharing images
become absolute when `custom_domain` is configured. Do not invent response
headers; include `headers` only when the site has an explicit policy.

Write only the YAML to the file — no markdown fences, no explanation.

---

**[SCRIPT]** Validate the plan:

```bash
SITE_NAME=<site-name> bash scripts/validate-plan.sh
```

If this exits with errors, print them clearly to the user, correct
`build-plan.yaml` directly, and re-run validation. Do not proceed until the
plan is valid.

---

Tell the user: "Review `$SITES_DIR/<site-name>/build-plan.yaml` — this is the build contract. Check the page content, component structure, navigation, style, and contact settings. When ready, run `/build <site-name>` (or `/deploy <site-name>`)."
