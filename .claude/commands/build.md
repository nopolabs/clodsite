Build the Clodsite static site from the approved build plan.

---

**Get site name.** Look at what the user typed after `/build`. If no site name was provided:

> "Please provide a site name: `/build <site-name>` — e.g., `/build acme-corp`"

And stop.

---

**[SCRIPT]** Validate the build plan:

```bash
SITE_NAME=<site-name> bash scripts/validate-plan.sh
```

If this exits with errors, print them clearly to the user and stop. Correct `$SITES_DIR/<site-name>/build-plan.yaml` directly to resolve them, then re-run validation.

---

**[SCRIPT]** Write structural site data:

```bash
SITE_NAME=<site-name> bash scripts/write-site-json.sh
```

**[SCRIPT]** Validate theme file:

```bash
SITE_NAME=<site-name> bash scripts/apply-theme.sh
```

---

**[SCRIPT]** Render templates from the build plan:

```bash
SITE_NAME=<site-name> bash scripts/render-templates.sh
```

This script reads `$SITES_DIR/<site-name>/build-plan.yaml` and emits one `.njk`
file per page into `$SITES_DIR/<site-name>/src/`. Each emitted file `{% include %}`s
the appropriate component templates from `components/`. No content decisions
happen here — the script is purely structural.

---

**[SCRIPT]** Run the Eleventy build:

```bash
SITE_NAME=<site-name> bash scripts/build-site.sh
```

If it exits with an error, show the error output clearly. Common causes: malformed Nunjucks syntax in a generated template, missing layout reference, or empty `$SITES_DIR/<site-name>/dist/`. Fix the template(s) and re-run this script.

---

**[SCRIPT]** Render Cloudflare Pages response headers:

```bash
SITE_NAME=<site-name> bash scripts/render-headers.sh
```

This writes `$SITES_DIR/<site-name>/dist/_headers` when the build plan contains
response-header rules, or removes a stale generated file when it does not.
