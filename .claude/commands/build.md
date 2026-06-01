Build the Clodsite static site from the approved build plan.

---

**Get site name.** Look at what the user typed after `/build`. If no site name was provided:

> "Please provide a site name: `/build <site-name>` — e.g., `/build acme-corp`"

And stop.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

```bash
bash scripts/migrate-site.sh
```

---

**[SCRIPT]** Validate the build plan:

```bash
SITE_DIR=sites/<site-name> bash scripts/validate-plan.sh
```

If this exits with errors, print them clearly to the user and stop. The user should re-run `/plan <site-name>` to regenerate the build plan.

---

**[SCRIPT]** Write structural site data:

```bash
SITE_DIR=sites/<site-name> bash scripts/write-site-json.sh
```

**[SCRIPT]** Validate theme file:

```bash
SITE_DIR=sites/<site-name> bash scripts/apply-theme.sh
```

---

**[SCRIPT]** Render templates from the build plan:

```bash
SITE_DIR=sites/<site-name> bash scripts/render-templates.sh
```

This script reads `sites/<site-name>/build-plan.yaml` and emits one `.njk`
file per page into `sites/<site-name>/src/`. Each emitted file `{% include %}`s
the appropriate component templates from `components/`. No content decisions
happen here — the script is purely structural.

---

**[SCRIPT]** Run the Eleventy build:

```bash
SITE_DIR=sites/<site-name> bash scripts/build-site.sh
```

If it exits with an error, show the error output clearly. Common causes: malformed Nunjucks syntax in a generated template, missing layout reference, or empty `sites/<site-name>/dist/`. Fix the template(s) and re-run this script.
