# Clodsite Build Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Clodsite Claude Code template — scripts, Eleventy scaffold, command files, and docs — so a user can clone it, run five commands, and have a live site on Cloudflare Pages.

**Architecture:** Claude orchestrates (Model A): `.claude/commands/` files are markdown instructions; Claude uses its Bash tool for `[SCRIPT]` steps and performs `[LLM]` steps itself. Nine bash scripts handle all deterministic work; Claude handles all reasoning/generation. Page content is baked into Eleventy Nunjucks templates by Claude during `/build`; `site.json` carries structural data only.

**Tech Stack:** Eleventy 2.x, Nunjucks templates, Cloudflare Pages, Wrangler CLI, Node.js (for JSON ops in scripts), bash

---

## File Map

Files created or modified by this plan. Every task references exact paths from here.

```
.gitignore                              # Task 1
scaffold/
  .eleventy.js                          # Task 2
  package.json                          # Task 2
  src/
    _data/
      site.json                         # Task 2 (stub), overwritten by /build
    _includes/
      base.njk                          # Task 3
    css/
      themes/
        minimal.css                     # Task 4
        professional.css                # Task 4
        bold.css                        # Task 4
scripts/
  setup.sh                              # Task 5
  write-spec.sh                         # Task 6
  validate-spec.sh                      # Task 7
  write-plan.sh                         # Task 8
  write-site-json.sh                    # Task 9
  apply-theme.sh                        # Task 10
  build-site.sh                         # Task 10
  deploy.sh                             # Task 11
  deploy-finalize.sh                    # Task 11
  templates/
    NEXT-STEPS.template.md              # Task 11
  test/
    fixtures/
      valid-spec.json                   # Task 7
      invalid-missing-field.json        # Task 7
      invalid-bad-enum.json             # Task 7
    run-tests.sh                        # Task 7
.claude/
  commands/
    setup.md                            # Task 12
    interview.md                        # Task 13
    plan.md                             # Task 14
    build.md                            # Task 15
    deploy.md                           # Task 16
CLAUDE.md                               # Task 17
README.md                               # Task 18
```

**Simplification note vs. PRD script inventory:** `read-spec.sh` and `read-plan.sh` are dropped. Claude reads files directly in Model A; scripts that need spec data parse `site-spec.json` inline with `node -e`. Script count is 9, not 11.

---

## Task 1: Repo Foundation

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

```
# Environment
.env

# Cloudflare deploy artifacts
scripts/.deploy-output
scripts/.deploy-error
scripts/.deploy-exit
scripts/.spec-draft.json
scripts/.plan-draft.md

# Eleventy build output
dist/
scaffold/node_modules/

# macOS
.DS_Store
```

- [ ] **Step 2: Create directory skeleton**

```bash
mkdir -p scaffold/src/_data scaffold/src/_includes scaffold/src/css/themes
mkdir -p scripts/templates scripts/test/fixtures
mkdir -p .claude/commands docs
```

- [ ] **Step 3: Verify structure**

```bash
find . -type d -not -path './.git/*' -not -path './node_modules/*' | sort
```

Expected: all directories from the file map exist.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "feat: repo foundation — .gitignore and directory structure"
```

---

## Task 2: Eleventy Scaffold

**Files:**
- Create: `scaffold/package.json`
- Create: `scaffold/.eleventy.js`
- Create: `scaffold/src/_data/site.json`

- [ ] **Step 1: Create scaffold/package.json**

```json
{
  "name": "clodsite-scaffold",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "eleventy",
    "serve": "eleventy --serve"
  },
  "dependencies": {
    "@11ty/eleventy": "^2.0.1"
  }
}
```

- [ ] **Step 2: Install Eleventy**

```bash
cd scaffold && npm install
```

Expected: `scaffold/node_modules/` created, no errors.

- [ ] **Step 3: Create scaffold/.eleventy.js**

```javascript
module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  return {
    dir: {
      input: "src",
      output: "../dist",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "html"],
    htmlTemplateEngine: "njk"
  };
};
```

Note: `output: "../dist"` puts the built site at the repo root `dist/` when Eleventy runs from `scaffold/`.

- [ ] **Step 4: Create scaffold/src/_data/site.json (stub)**

This is a placeholder so the scaffold builds clean before `/build` runs. It will be overwritten by `write-site-json.sh`.

```json
{
  "name": "Clodsite",
  "purpose": "Stub — run /interview and /build to populate",
  "audience": "",
  "tone": "professional",
  "style": "minimal",
  "nav": {
    "order": ["home"],
    "show_contact_link": false,
    "pages": [
      { "id": "home", "title": "Home", "href": "/" }
    ]
  },
  "contact": {
    "enabled": false,
    "type": "email",
    "email": ""
  }
}
```

- [ ] **Step 5: Create a stub index.njk to verify the build runs**

No layout reference — base.njk doesn't exist yet (Task 3). This just confirms Eleventy processes templates correctly.

```nunjucks
---
permalink: /
---
<!DOCTYPE html>
<html><body><h1>{{ site.name }}</h1><p>{{ site.purpose }}</p></body></html>
```

Save to `scaffold/src/index.njk`.

- [ ] **Step 6: Test the stub build**

```bash
cd scaffold && npm run build
```

Expected: exits 0. `dist/index.html` exists.

```bash
grep -q "Clodsite" ../dist/index.html && echo "✓ site.json data rendered"
```

Expected: `✓ site.json data rendered`

- [ ] **Step 7: Delete the stub index.njk** (it will be regenerated by `/build`)

```bash
rm scaffold/src/index.njk
```

- [ ] **Step 8: Commit**

```bash
git add scaffold/
git commit -m "feat: Eleventy scaffold with passthrough CSS and dist output"
```

---

## Task 3: Base Nunjucks Layout

**Files:**
- Create: `scaffold/src/_includes/base.njk`

- [ ] **Step 1: Create base.njk**

```nunjucks
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{% if pageTitle %}{{ pageTitle }} | {% endif %}{{ site.name }}</title>
  <link rel="stylesheet" href="/css/themes/{{ site.style }}.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  {% if site.style == "minimal" %}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  {% elif site.style == "professional" %}
  <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
  {% elif site.style == "bold" %}
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
  {% endif %}
</head>
<body class="theme-{{ site.style }}">
  <header class="site-header">
    <nav class="site-nav">
      <a href="/" class="site-name">{{ site.name }}</a>
      <ul class="nav-links">
        {% for navPage in site.nav.pages %}
          <li><a href="{{ navPage.href }}">{{ navPage.title }}</a></li>
        {% endfor %}
        {% if site.nav.show_contact_link and site.contact.enabled %}
          <li><a href="/contact">Contact</a></li>
        {% endif %}
      </ul>
    </nav>
  </header>
  <main class="site-main">
    {{ content | safe }}
  </main>
  <footer class="site-footer">
    <p>&copy; {{ site.name }}</p>
  </footer>
</body>
</html>
```

- [ ] **Step 2: Verify the layout renders with the stub**

Re-create the stub temporarily to test:

```bash
cat > scaffold/src/index.njk << 'EOF'
---
layout: base.njk
pageTitle: Home
permalink: /
---
<h1>Test</h1>
EOF
cd scaffold && npm run build && cat ../dist/index.html | grep -q "site-header" && echo "✓ Layout renders"
rm scaffold/src/index.njk
```

Expected: `✓ Layout renders`

- [ ] **Step 3: Commit**

```bash
git add scaffold/src/_includes/base.njk
git commit -m "feat: base Nunjucks layout with dynamic theme and nav"
```

---

## Task 4: CSS Theme Files

**Files:**
- Create: `scaffold/src/css/themes/minimal.css`
- Create: `scaffold/src/css/themes/professional.css`
- Create: `scaffold/src/css/themes/bold.css`

- [ ] **Step 1: Create minimal.css**

```css
:root {
  --color-bg: #ffffff;
  --color-text: #1a1a1a;
  --color-accent: #0066cc;
  --color-surface: #f5f5f5;
  --font-heading: 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-size-base: 1rem;
  --spacing-section: 4rem;
  --border-radius: 2px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); font-size: var(--font-size-base); line-height: 1.6; }
h1, h2, h3 { font-family: var(--font-heading); line-height: 1.2; margin-bottom: 1rem; }
h1 { font-size: 2.25rem; font-weight: 700; }
h2 { font-size: 1.5rem; font-weight: 600; }
p { margin-bottom: 1rem; }
a { color: var(--color-accent); text-decoration: underline; }

.site-header { padding: 1.25rem 2rem; border-bottom: 1px solid var(--color-surface); }
.site-nav { display: flex; align-items: center; gap: 2rem; max-width: 64rem; margin: 0 auto; }
.site-name { font-weight: 700; font-size: 1.1rem; text-decoration: none; color: var(--color-text); }
.nav-links { display: flex; list-style: none; gap: 1.5rem; }
.nav-links a { text-decoration: none; color: var(--color-text); font-size: 0.95rem; }
.nav-links a:hover { color: var(--color-accent); }

.site-main { max-width: 64rem; margin: 0 auto; padding: var(--spacing-section) 2rem; }
.site-footer { text-align: center; padding: 2rem; color: #888; font-size: 0.875rem; border-top: 1px solid var(--color-surface); }

section { margin-bottom: var(--spacing-section); }
```

- [ ] **Step 2: Create professional.css**

```css
:root {
  --color-bg: #fafafa;
  --color-text: #212121;
  --color-accent: #1a3a5c;
  --color-surface: #e8edf2;
  --font-heading: 'Merriweather', serif;
  --font-body: 'Source Sans 3', sans-serif;
  --font-size-base: 1.0625rem;
  --spacing-section: 5rem;
  --border-radius: 4px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); font-size: var(--font-size-base); line-height: 1.7; }
h1, h2, h3 { font-family: var(--font-heading); line-height: 1.3; margin-bottom: 1.25rem; }
h1 { font-size: 2rem; font-weight: 700; }
h2 { font-size: 1.4rem; font-weight: 700; }
p { margin-bottom: 1.25rem; }
a { color: var(--color-accent); }

.site-header { background: var(--color-accent); padding: 1rem 2rem; }
.site-nav { display: flex; align-items: center; gap: 2rem; max-width: 64rem; margin: 0 auto; }
.site-name { font-weight: 700; font-size: 1.1rem; text-decoration: none; color: #ffffff; font-family: var(--font-heading); }
.nav-links { display: flex; list-style: none; gap: 1.5rem; }
.nav-links a { text-decoration: none; color: rgba(255,255,255,0.85); font-size: 0.95rem; }
.nav-links a:hover { color: #ffffff; }

.site-main { max-width: 64rem; margin: 0 auto; padding: var(--spacing-section) 2rem; }
.site-footer { text-align: center; padding: 2rem; background: var(--color-surface); color: #555; font-size: 0.875rem; }

section { margin-bottom: var(--spacing-section); }
```

- [ ] **Step 3: Create bold.css**

```css
:root {
  --color-bg: #0f0f0f;
  --color-text: #f0f0f0;
  --color-accent: #ff4500;
  --color-surface: #1e1e1e;
  --font-heading: 'Space Grotesk', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --font-size-base: 1.125rem;
  --spacing-section: 6rem;
  --border-radius: 0px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); font-size: var(--font-size-base); line-height: 1.6; }
h1, h2, h3 { font-family: var(--font-heading); line-height: 1.1; margin-bottom: 1.25rem; text-transform: uppercase; letter-spacing: -0.02em; }
h1 { font-size: 3rem; font-weight: 700; color: var(--color-accent); }
h2 { font-size: 1.75rem; font-weight: 700; }
p { margin-bottom: 1.25rem; }
a { color: var(--color-accent); text-decoration: none; border-bottom: 1px solid var(--color-accent); }

.site-header { background: var(--color-surface); padding: 1.25rem 2rem; border-bottom: 2px solid var(--color-accent); }
.site-nav { display: flex; align-items: center; gap: 2rem; max-width: 72rem; margin: 0 auto; }
.site-name { font-weight: 700; font-size: 1.2rem; text-decoration: none; border: none; color: var(--color-accent); font-family: var(--font-heading); text-transform: uppercase; letter-spacing: 0.05em; }
.nav-links { display: flex; list-style: none; gap: 2rem; }
.nav-links a { text-decoration: none; border: none; color: var(--color-text); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; }
.nav-links a:hover { color: var(--color-accent); }

.site-main { max-width: 72rem; margin: 0 auto; padding: var(--spacing-section) 2rem; }
.site-footer { text-align: center; padding: 2rem; background: var(--color-surface); color: #666; font-size: 0.875rem; border-top: 2px solid var(--color-accent); }

section { margin-bottom: var(--spacing-section); }
```

- [ ] **Step 4: Verify CSS passes through Eleventy**

```bash
cat > scaffold/src/index.njk << 'EOF'
---
layout: base.njk
pageTitle: Home
permalink: /
---
<h1>Theme test</h1>
EOF
cd scaffold && npm run build
ls ../dist/css/themes/
```

Expected: `minimal.css  professional.css  bold.css`

```bash
rm scaffold/src/index.njk
```

- [ ] **Step 5: Commit**

```bash
git add scaffold/src/css/ scaffold/src/_includes/
git commit -m "feat: three CSS personality themes (minimal, professional, bold)"
```

---

## Task 5: scripts/setup.sh

**Files:**
- Create: `scripts/setup.sh`

- [ ] **Step 1: Create scripts/setup.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Clodsite Setup ==="
echo ""

# Check wrangler is installed
if ! command -v wrangler &> /dev/null; then
  echo "Error: wrangler is not installed."
  echo ""
  echo "Install it with:"
  echo "  npm install -g wrangler"
  echo ""
  echo "Then run /setup again."
  exit 1
fi

echo "✓ wrangler found: $(wrangler --version)"
echo ""

# Prompt for token (masked)
echo "Enter your Cloudflare API Token."
echo "(Create one at: https://dash.cloudflare.com/profile/api-tokens)"
echo -n "Token: "
read -rs CF_TOKEN
echo ""

if [ -z "$CF_TOKEN" ]; then
  echo "Error: No token entered."
  exit 1
fi

# Verify token
echo "Verifying token..."
if ! CLOUDFLARE_API_TOKEN="$CF_TOKEN" wrangler whoami > /dev/null 2>&1; then
  echo ""
  echo "Error: Token verification failed."
  echo "Check that your token has 'Cloudflare Pages: Edit' permission and try again."
  exit 1
fi

# Write .env
echo "CLOUDFLARE_API_TOKEN=$CF_TOKEN" > .env
echo ""
echo "✓ Token verified."
echo "✓ .env written."
echo ""
echo "Next step: run /interview"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/setup.sh
```

- [ ] **Step 3: Smoke test (dry run — no real token needed)**

```bash
# Test wrangler not installed path by temporarily renaming it
# Instead, just verify the script is syntactically valid:
bash -n scripts/setup.sh && echo "✓ setup.sh syntax OK"
```

Expected: `✓ setup.sh syntax OK`

- [ ] **Step 4: Commit**

```bash
git add scripts/setup.sh
git commit -m "feat: scripts/setup.sh — wrangler check, token prompt, verify, write .env"
```

---

## Task 6: scripts/write-spec.sh

**Files:**
- Create: `scripts/write-spec.sh`

- [ ] **Step 1: Create scripts/write-spec.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

DRAFT="scripts/.spec-draft.json"

if [ ! -f "$DRAFT" ]; then
  echo "Error: $DRAFT not found."
  echo "This script is called by the /interview command after Claude writes the spec JSON."
  exit 1
fi

# Validate it's parseable JSON
if ! node -e "JSON.parse(require('fs').readFileSync('$DRAFT', 'utf8'))" 2>/dev/null; then
  echo "Error: $DRAFT is not valid JSON. Check Claude's output."
  exit 1
fi

# Save as site-spec.json
cp "$DRAFT" site-spec.json

# Generate human-readable site-spec.md
node -e "
const spec = JSON.parse(require('fs').readFileSync('site-spec.json', 'utf8'));
const lines = [
  '# Site Spec',
  '',
  '_Generated by /interview. Do not edit manually._',
  '_To update: re-run /interview (or /modify when available)._',
  '',
  '\`\`\`json',
  JSON.stringify(spec, null, 2),
  '\`\`\`',
  ''
];
require('fs').writeFileSync('site-spec.md', lines.join('\n'));
"

# Clean up draft
rm "$DRAFT"

echo "✓ Spec written to site-spec.json and site-spec.md"
echo ""
echo "Next step: run /plan"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/write-spec.sh
```

- [ ] **Step 3: Test with a sample JSON draft**

```bash
cat > scripts/.spec-draft.json << 'EOF'
{
  "site": { "name": "Test Site", "purpose": "Testing", "audience": "Testers", "tone": "casual", "style": "minimal" },
  "pages": [{ "id": "home", "title": "Home", "purpose": "Landing", "content_outline": "Welcome" }],
  "nav": { "order": ["home"], "show_contact_link": false },
  "contact": { "enabled": false, "type": "email", "email": "" },
  "domain": { "custom": false, "hostname": "" },
  "content_status": "draft",
  "meta": { "generated_at": "2026-05-14T00:00:00Z", "spec_version": "1.0" }
}
EOF
bash scripts/write-spec.sh
```

Expected:
```
✓ Spec written to site-spec.json and site-spec.md
```

```bash
# Verify both files exist
ls site-spec.json site-spec.md && echo "✓ Both files created"
# Verify draft was cleaned up
[ ! -f scripts/.spec-draft.json ] && echo "✓ Draft cleaned up"
# Clean up
rm site-spec.json site-spec.md
```

- [ ] **Step 4: Commit**

```bash
git add scripts/write-spec.sh
git commit -m "feat: scripts/write-spec.sh — saves spec JSON and generates readable .md"
```

---

## Task 7: scripts/validate-spec.sh with Tests

**Files:**
- Create: `scripts/validate-spec.sh`
- Create: `scripts/test/fixtures/valid-spec.json`
- Create: `scripts/test/fixtures/invalid-missing-field.json`
- Create: `scripts/test/fixtures/invalid-bad-enum.json`
- Create: `scripts/test/run-tests.sh`

- [ ] **Step 1: Create test fixtures**

`scripts/test/fixtures/valid-spec.json`:
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
  "nav": { "order": ["home", "about"], "show_contact_link": false },
  "contact": { "enabled": false, "type": "email", "email": "" },
  "domain": { "custom": false, "hostname": "" },
  "content_status": "draft",
  "meta": { "generated_at": "2026-05-14T00:00:00Z", "spec_version": "1.0" }
}
```

`scripts/test/fixtures/invalid-missing-field.json` (missing `site.purpose`):
```json
{
  "site": { "name": "Broken Site", "audience": "Nobody", "tone": "casual", "style": "minimal" },
  "pages": [
    { "id": "home", "title": "Home", "purpose": "Landing", "content_outline": "Hello" }
  ],
  "nav": { "order": ["home"], "show_contact_link": false },
  "contact": { "enabled": false, "type": "email", "email": "" },
  "domain": { "custom": false, "hostname": "" },
  "content_status": "draft",
  "meta": { "generated_at": "2026-05-14T00:00:00Z", "spec_version": "1.0" }
}
```

`scripts/test/fixtures/invalid-bad-enum.json` (invalid `site.style`):
```json
{
  "site": { "name": "Bad Style", "purpose": "Testing", "audience": "Testers", "tone": "casual", "style": "funky" },
  "pages": [
    { "id": "home", "title": "Home", "purpose": "Landing", "content_outline": "Hello" }
  ],
  "nav": { "order": ["home"], "show_contact_link": false },
  "contact": { "enabled": false, "type": "email", "email": "" },
  "domain": { "custom": false, "hostname": "" },
  "content_status": "draft",
  "meta": { "generated_at": "2026-05-14T00:00:00Z", "spec_version": "1.0" }
}
```

- [ ] **Step 2: Run tests to confirm they would fail (validate-spec.sh doesn't exist yet)**

```bash
ls scripts/validate-spec.sh 2>/dev/null || echo "✓ validate-spec.sh not yet created — expected"
```

- [ ] **Step 3: Create scripts/validate-spec.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

SPEC="${1:-site-spec.json}"

if [ ! -f "$SPEC" ]; then
  echo "Error: $SPEC not found. Run /interview first."
  exit 1
fi

node -e "
const spec = JSON.parse(require('fs').readFileSync('$SPEC', 'utf8'));
const errors = [];

if (!spec.site?.name)     errors.push('site.name is required');
if (!spec.site?.purpose)  errors.push('site.purpose is required');
if (!spec.site?.audience) errors.push('site.audience is required');

const validTones = ['professional', 'casual', 'technical', 'friendly'];
if (!validTones.includes(spec.site?.tone))
  errors.push('site.tone must be one of: ' + validTones.join(', ') + ' (got: ' + spec.site?.tone + ')');

const validStyles = ['minimal', 'professional', 'bold'];
if (!validStyles.includes(spec.site?.style))
  errors.push('site.style must be one of: ' + validStyles.join(', ') + ' (got: ' + spec.site?.style + ')');

if (!Array.isArray(spec.pages) || spec.pages.length < 2 || spec.pages.length > 5) {
  errors.push('pages must be an array of 2-5 items (got: ' + (Array.isArray(spec.pages) ? spec.pages.length : 'non-array') + ')');
} else {
  const ids = spec.pages.map(p => p.id);
  const seen = new Set();
  ids.forEach(id => { if (seen.has(id)) errors.push('duplicate page id: ' + id); seen.add(id); });
  spec.pages.forEach((p, i) => {
    if (!p.id || !/^[a-z0-9-]+$/.test(p.id))      errors.push('pages[' + i + '].id must be lowercase alphanumeric/hyphens (got: ' + p.id + ')');
    if (!p.title)          errors.push('pages[' + i + '].title is required');
    if (!p.purpose)        errors.push('pages[' + i + '].purpose is required');
    if (!p.content_outline) errors.push('pages[' + i + '].content_outline is required');
  });
}

if (spec.contact?.enabled) {
  const validTypes = ['email', 'form'];
  if (!validTypes.includes(spec.contact?.type))
    errors.push('contact.type must be email or form when contact.enabled is true');
  if (spec.contact?.type === 'email' && !spec.contact?.email)
    errors.push('contact.email is required when contact.type is email');
}

if (spec.domain?.custom && !spec.domain?.hostname)
  errors.push('domain.hostname is required when domain.custom is true');

const validStatus = ['provided', 'draft'];
if (!validStatus.includes(spec.content_status))
  errors.push('content_status must be one of: ' + validStatus.join(', ') + ' (got: ' + spec.content_status + ')');

if (errors.length > 0) {
  console.error('Spec validation failed (' + errors.length + ' error(s)):');
  errors.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log('✓ Spec is valid (' + spec.pages.length + ' pages, style: ' + spec.site.style + ')');
"
```

- [ ] **Step 4: Make executable**

```bash
chmod +x scripts/validate-spec.sh
```

- [ ] **Step 5: Create scripts/test/run-tests.sh**

```bash
#!/usr/bin/env bash
set -uo pipefail

PASS=0
FAIL=0

assert_exit() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected exit $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_exists() {
  local desc="$1" file="$2"
  if [ -f "$file" ]; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc ($file not found)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== validate-spec.sh ==="

cp scripts/test/fixtures/valid-spec.json site-spec.json
bash scripts/validate-spec.sh > /dev/null 2>&1; assert_exit "valid spec passes" 0 $?

cp scripts/test/fixtures/invalid-missing-field.json site-spec.json
bash scripts/validate-spec.sh > /dev/null 2>&1; assert_exit "missing field exits 1" 1 $?

cp scripts/test/fixtures/invalid-bad-enum.json site-spec.json
bash scripts/validate-spec.sh > /dev/null 2>&1; assert_exit "bad enum exits 1" 1 $?

echo ""
echo "=== write-site-json.sh ==="

cp scripts/test/fixtures/valid-spec.json site-spec.json
bash scripts/write-site-json.sh > /dev/null 2>&1; assert_exit "write-site-json exits 0" 0 $?
assert_file_exists "site.json created" "scaffold/src/_data/site.json"

echo ""
echo "=== apply-theme.sh ==="

cp scripts/test/fixtures/valid-spec.json site-spec.json
bash scripts/apply-theme.sh > /dev/null 2>&1; assert_exit "apply-theme exits 0 for valid style" 0 $?

# Clean up test artifacts
rm -f site-spec.json
# Restore stub site.json
cat > scaffold/src/_data/site.json << 'ENDJSON'
{
  "name": "Clodsite",
  "purpose": "Stub — run /interview and /build to populate",
  "audience": "",
  "tone": "professional",
  "style": "minimal",
  "nav": { "order": ["home"], "show_contact_link": false, "pages": [{ "id": "home", "title": "Home", "href": "/" }] },
  "contact": { "enabled": false, "type": "email", "email": "" }
}
ENDJSON

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

- [ ] **Step 6: Make test runner executable**

```bash
chmod +x scripts/test/run-tests.sh
```

- [ ] **Step 7: Run tests (validate-spec only at this point)**

```bash
bash scripts/test/run-tests.sh 2>/dev/null | head -10
```

Expected: validate-spec tests pass; write-site-json and apply-theme tests will fail until those scripts exist (that's fine).

- [ ] **Step 8: Commit**

```bash
git add scripts/validate-spec.sh scripts/test/
git commit -m "feat: scripts/validate-spec.sh with test fixtures and test runner"
```

---

## Task 8: scripts/write-plan.sh

**Files:**
- Create: `scripts/write-plan.sh`

- [ ] **Step 1: Create scripts/write-plan.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

DRAFT="scripts/.plan-draft.md"

if [ ! -f "$DRAFT" ]; then
  echo "Error: $DRAFT not found."
  echo "This script is called by the /plan command after Claude writes the build plan."
  exit 1
fi

cp "$DRAFT" build-plan.md
rm "$DRAFT"

echo "✓ Build plan written to build-plan.md"
echo ""
echo "Review build-plan.md — check the page copy and structure."
echo "When ready: run /build"
```

- [ ] **Step 2: Make executable and test**

```bash
chmod +x scripts/write-plan.sh
echo "# Test Plan" > scripts/.plan-draft.md
bash scripts/write-plan.sh
ls build-plan.md && echo "✓ build-plan.md created"
[ ! -f scripts/.plan-draft.md ] && echo "✓ draft cleaned up"
rm build-plan.md
```

Expected: both confirmations print.

- [ ] **Step 3: Commit**

```bash
git add scripts/write-plan.sh
git commit -m "feat: scripts/write-plan.sh — saves plan markdown from draft"
```

---

## Task 9: scripts/write-site-json.sh

**Files:**
- Modify: `scripts/write-site-json.sh`

- [ ] **Step 1: Create scripts/write-site-json.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "site-spec.json" ]; then
  echo "Error: site-spec.json not found. Run /interview first."
  exit 1
fi

node -e "
const spec = JSON.parse(require('fs').readFileSync('site-spec.json', 'utf8'));

// Build nav pages array with correct hrefs
// First page in nav.order with id 'home' (or just the first page) gets href '/'
const firstId = spec.nav.order[0];
const navPages = spec.nav.order.map(id => {
  const page = spec.pages.find(p => p.id === id);
  return {
    id: page.id,
    title: page.title,
    href: page.id === 'home' || id === firstId ? '/' : '/' + page.id
  };
});

// Only the first page (home) gets href '/', but if the first page isn't named 'home',
// it still gets '/' since it will be rendered as index.njk
const siteData = {
  name: spec.site.name,
  purpose: spec.site.purpose,
  audience: spec.site.audience,
  tone: spec.site.tone,
  style: spec.site.style,
  nav: {
    order: spec.nav.order,
    show_contact_link: spec.nav.show_contact_link,
    pages: navPages
  },
  contact: spec.contact || { enabled: false, type: 'email', email: '' }
};

require('fs').mkdirSync('scaffold/src/_data', { recursive: true });
require('fs').writeFileSync(
  'scaffold/src/_data/site.json',
  JSON.stringify(siteData, null, 2)
);
console.log('✓ scaffold/src/_data/site.json written');
console.log('  Site: ' + siteData.name + ' | Style: ' + siteData.style + ' | Pages: ' + siteData.nav.pages.length);
"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/write-site-json.sh
```

- [ ] **Step 3: Run tests (write-site-json tests now pass)**

```bash
bash scripts/test/run-tests.sh
```

Expected: write-site-json tests pass. apply-theme may still fail.

- [ ] **Step 4: Commit**

```bash
git add scripts/write-site-json.sh
git commit -m "feat: scripts/write-site-json.sh — transforms spec to Eleventy site.json"
```

---

## Task 10: scripts/apply-theme.sh and scripts/build-site.sh

**Files:**
- Create: `scripts/apply-theme.sh`
- Create: `scripts/build-site.sh`

- [ ] **Step 1: Create scripts/apply-theme.sh**

All three theme CSS files are pre-committed. The base template references them dynamically. This script validates the specified theme file exists — it does not copy anything.

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "site-spec.json" ]; then
  echo "Error: site-spec.json not found."
  exit 1
fi

STYLE=$(node -e "const s=JSON.parse(require('fs').readFileSync('site-spec.json','utf8')); console.log(s.site.style)")
THEME_FILE="scaffold/src/css/themes/${STYLE}.css"

if [ ! -f "$THEME_FILE" ]; then
  echo "Error: Theme file not found: $THEME_FILE"
  echo "Valid styles: minimal, professional, bold"
  exit 1
fi

echo "✓ Theme: $STYLE ($THEME_FILE exists)"
```

- [ ] **Step 2: Create scripts/build-site.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Building site with Eleventy..."
echo ""

# Run from scaffold/ so .eleventy.js config resolves correctly
# Output goes to ../dist (repo root dist/)
(cd scaffold && npx @11ty/eleventy 2>&1)

echo ""

# Verify output
if [ ! -d "dist" ] || [ -z "$(ls -A dist 2>/dev/null)" ]; then
  echo "Error: Build produced an empty dist/. Check Eleventy output above."
  exit 1
fi

PAGE_COUNT=$(find dist -name "*.html" | wc -l | tr -d ' ')
echo "✓ Build complete. $PAGE_COUNT HTML file(s) in dist/"
echo ""
echo "Next step: run /deploy"
```

- [ ] **Step 3: Make both executable**

```bash
chmod +x scripts/apply-theme.sh scripts/build-site.sh
```

- [ ] **Step 4: Run full test suite**

```bash
bash scripts/test/run-tests.sh
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/apply-theme.sh scripts/build-site.sh
git commit -m "feat: scripts/apply-theme.sh (validates theme) and build-site.sh (runs Eleventy)"
```

---

## Task 11: Deploy Scripts and NEXT-STEPS Template

**Files:**
- Create: `scripts/deploy.sh`
- Create: `scripts/deploy-finalize.sh`
- Create: `scripts/templates/NEXT-STEPS.template.md`

- [ ] **Step 1: Create scripts/templates/NEXT-STEPS.template.md**

```markdown
# Next Steps for {{SITE_NAME}}

Your site is live at: **{{DEPLOY_URL}}**

---

## Connect to GitHub for automatic deploys

Right now you deploy by running `/deploy` in Claude Code. To get automatic deploys on every git push:

1. Create a GitHub repo: `gh repo create {{SITE_NAME}} --public` (or via github.com)
2. Push this repo:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/{{SITE_NAME}}.git
   git push -u origin main
   ```
3. In **Cloudflare Dashboard → Pages → {{SITE_NAME}} → Settings → Build & Deploy → Connect to Git**
4. Select your repo. Set:
   - **Build command:** `cd scaffold && npm run build`
   - **Build output directory:** `dist`
5. Save. Every push to `main` now triggers an automatic deploy.

---

## Set up a custom domain

1. Buy or transfer your domain to Cloudflare (or just point DNS to Cloudflare)
2. In **Cloudflare Dashboard → Pages → {{SITE_NAME}} → Custom domains**
3. Add your domain and follow the DNS instructions
4. Cloudflare handles SSL automatically — no cert management needed

---

## Enable Web Analytics

1. In **Cloudflare Dashboard → Pages → {{SITE_NAME}} → Settings → Web Analytics**
2. Toggle on — no code changes or script tags needed

---

## Make changes to your site

- **Edit page content:** Open Claude Code in this directory and modify the `.njk` files in `scaffold/src/`
- **Change structure or branding:** Re-run `/interview` to update the spec, then `/plan` and `/build`
- **Re-deploy after changes:** Run `/deploy` (or push to GitHub if connected)
```

- [ ] **Step 2: Create scripts/deploy.sh**

```bash
#!/usr/bin/env bash
# Note: not using set -e here — we capture wrangler exit code manually

set -uo pipefail

# Check .env
if [ ! -f ".env" ]; then
  echo "Error: .env not found. Run /setup first."
  exit 1
fi

# shellcheck source=/dev/null
source .env

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN not set in .env. Run /setup first."
  exit 1
fi

# Check site-spec.json
if [ ! -f "site-spec.json" ]; then
  echo "Error: site-spec.json not found. Run /interview first."
  exit 1
fi

# Check dist/
if [ ! -d "dist" ] || [ -z "$(ls -A dist 2>/dev/null)" ]; then
  echo "Error: dist/ is empty or missing. Run /build first."
  exit 1
fi

# Derive project name: site.name → lowercase, spaces/special chars → hyphens
SITE_NAME=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('site-spec.json', 'utf8'));
const slug = spec.site.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
console.log(slug);
")

echo "Deploying '$SITE_NAME' to Cloudflare Pages..."
echo ""

mkdir -p scripts

CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
  wrangler pages deploy dist --project-name "$SITE_NAME" \
  > scripts/.deploy-output 2> scripts/.deploy-error
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > scripts/.deploy-exit
exit $WRANGLER_EXIT
```

- [ ] **Step 3: Create scripts/deploy-finalize.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "scripts/.deploy-output" ]; then
  echo "Error: No deployment output found. Run /deploy first."
  exit 1
fi

# Parse deployment URL from wrangler stdout
DEPLOY_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.pages\.dev' scripts/.deploy-output | tail -1)

if [ -z "$DEPLOY_URL" ]; then
  echo "Error: Could not parse deployment URL from wrangler output."
  echo "Raw output:"
  cat scripts/.deploy-output
  exit 1
fi

# Derive site name for substitution
SITE_NAME=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('site-spec.json', 'utf8'));
const slug = spec.site.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
console.log(slug);
")

# Update site-spec.json with deployed URL
node -e "
const spec = JSON.parse(require('fs').readFileSync('site-spec.json', 'utf8'));
if (!spec.meta) spec.meta = {};
spec.meta.deployed_url = '$DEPLOY_URL';
require('fs').writeFileSync('site-spec.json', JSON.stringify(spec, null, 2));
"

# Write NEXT-STEPS.md from template
sed "s|{{DEPLOY_URL}}|$DEPLOY_URL|g; s|{{SITE_NAME}}|$SITE_NAME|g" \
  scripts/templates/NEXT-STEPS.template.md > NEXT-STEPS.md

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Your site is live!                          ║"
echo "║                                              ║"
printf  "║  %-44s ║\n" "$DEPLOY_URL"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "See NEXT-STEPS.md for next steps (custom domain, GitHub Actions, analytics)."
```

- [ ] **Step 4: Make both executable**

```bash
chmod +x scripts/deploy.sh scripts/deploy-finalize.sh
```

- [ ] **Step 5: Verify syntax**

```bash
bash -n scripts/deploy.sh && echo "✓ deploy.sh syntax OK"
bash -n scripts/deploy-finalize.sh && echo "✓ deploy-finalize.sh syntax OK"
```

Expected: both print OK.

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy.sh scripts/deploy-finalize.sh scripts/templates/
git commit -m "feat: deploy scripts and NEXT-STEPS.md template"
```

---

## Task 12: .claude/commands/setup.md

**Files:**
- Create: `.claude/commands/setup.md`

- [ ] **Step 1: Create .claude/commands/setup.md**

```markdown
Run Clodsite setup to collect and verify your Cloudflare credentials.

**[SCRIPT]** Run the setup script:

```bash
bash scripts/setup.sh
```

Follow any instructions it prints. If it exits with an error, resolve the issue it describes before continuing.

When setup completes successfully, `.env` will contain a verified `CLOUDFLARE_API_TOKEN`.

**Next:** Run `/interview` to start building your site.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/setup.md
git commit -m "feat: /setup command definition"
```

---

## Task 13: .claude/commands/interview.md

**Files:**
- Create: `.claude/commands/interview.md`

- [ ] **Step 1: Create .claude/commands/interview.md**

````markdown
Conduct the Clodsite site interview. You are helping someone build a website. Be conversational, professional, and efficient. Ask one question at a time and wait for the answer before proceeding.

---

**[LLM]** Ask the following questions in order. One at a time:

1. What is the name of your site or brand?
2. In one sentence, what does this site do or offer?
3. Who is this site for?
4. What tone should the writing have? *(professional / casual / technical / friendly)*
5. What visual personality fits best? *(minimal / professional / bold)* — briefly describe each if they ask.
6. What pages do you need? List 2–5 page names. *(e.g., Home, About, Services, Contact)*
7. For each page you listed: what is the purpose of this page in one sentence?
8. Do you have copy ready for the pages, or should I draft it? *(provided / draft)*
9. *(If provided)* Please share the content for each page — paste it or describe it.
   *(If draft)* For each page, describe in a few sentences what it should say.
10. Do you want a contact method on the site? If yes: email address, or contact form?
11. *(Optional)* Do you have a custom domain, or is a `*.pages.dev` URL fine for now?

---

**[LLM]** Once all answers are collected, synthesize them into a single JSON object. Follow this schema exactly — no extra fields, no comments, no trailing commas:

```json
{
  "site": {
    "name": "...",
    "purpose": "...",
    "audience": "...",
    "tone": "professional|casual|technical|friendly",
    "style": "minimal|professional|bold"
  },
  "pages": [
    {
      "id": "lowercase-slug",
      "title": "Display Name",
      "purpose": "one sentence",
      "content_outline": "user copy or draft directive"
    }
  ],
  "nav": {
    "order": ["page-id-1", "page-id-2"],
    "show_contact_link": true
  },
  "contact": {
    "enabled": true,
    "type": "email",
    "email": "address@example.com"
  },
  "domain": {
    "custom": false,
    "hostname": ""
  },
  "content_status": "provided|draft",
  "meta": {
    "generated_at": "ISO-8601 timestamp of right now",
    "spec_version": "1.0"
  }
}
```

Rules:
- `pages[].id` must be lowercase, no spaces, hyphens only (e.g., `home`, `about`, `our-work`)
- `nav.order` must list every page id
- If `contact.enabled = false`, set `type: "email"` and `email: ""`
- If `domain.custom = false`, set `hostname: ""`
- `content_status` = `"provided"` if user supplied copy; `"draft"` if Claude should write it

Write the JSON to the file `scripts/.spec-draft.json`. Use the Write tool to create this file. The file should contain only the JSON — no markdown fences, no explanation.

---

**[SCRIPT]** Run:

```bash
bash scripts/write-spec.sh
```

This saves the spec and confirms the next step.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/interview.md
git commit -m "feat: /interview command definition with 10-question flow and JSON output"
```

---

## Task 14: .claude/commands/plan.md

**Files:**
- Create: `.claude/commands/plan.md`

- [ ] **Step 1: Create .claude/commands/plan.md**

````markdown
Generate the Clodsite build plan from the approved spec.

---

**[SCRIPT]** Validate the spec first:

```bash
bash scripts/validate-spec.sh
```

If this exits with errors, print them clearly to the user and stop. Do not proceed until the spec is valid. The user can edit `site-spec.json` directly or re-run `/interview`.

---

**[LLM]** Read `site-spec.json`. Generate the build plan as markdown with these sections:

## Site Overview
Name, purpose, audience, tone, and style. One short paragraph.

## Pages
One section per page. For each:
- **[page title]** — `[page id]`
- Purpose: (from spec)
- Content:
  - If `content_status = "provided"`: use `content_outline` as-is
  - If `content_status = "draft"`: generate complete, publish-ready copy using `content_outline` as your brief. Write real sentences. Match the site tone. This is the copy that will appear on the live site.

## Navigation
Confirm the nav order. Note whether the contact link appears in the nav.

## Contact
How contact is handled: email address shown, contact form, or disabled.

## Build Notes
Anything unusual about this site that `/build` should know (e.g., specific layout needs, contact form handling).

---

Write the complete plan markdown to the file `scripts/.plan-draft.md`. Use the Write tool. The file should contain the markdown above — no extra commentary.

---

**[SCRIPT]** Run:

```bash
bash scripts/write-plan.sh
```

This saves the plan and tells the user to review it before running `/build`.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/plan.md
git commit -m "feat: /plan command definition with validation gate and copy generation"
```

---

## Task 15: .claude/commands/build.md

**Files:**
- Create: `.claude/commands/build.md`

- [ ] **Step 1: Create .claude/commands/build.md**

````markdown
Build the Clodsite static site from the approved spec and build plan.

---

**[SCRIPT]** Write structural site data:

```bash
bash scripts/write-site-json.sh
```

**[SCRIPT]** Validate theme file:

```bash
bash scripts/apply-theme.sh
```

---

**[LLM]** Read `site-spec.json` and `build-plan.md`.

Generate an Eleventy Nunjucks template for each page listed in `site-spec.json pages[]`.

**Template rules:**
- The first page in `nav.order` gets `permalink: /` in its front matter and is saved as `scaffold/src/index.njk`
- All other pages get `permalink: /[page-id]` and are saved as `scaffold/src/[page-id].njk`
- Every template uses `layout: base.njk` and sets `pageTitle` to the page's display title
- Write page content directly as HTML — do not use `{{ site.* }}` references for copy. Use site data references only for structural elements you need from the layout (those are already in `base.njk`)
- Use semantic HTML: `<h1>` for the main page heading, `<p>` for paragraphs, `<section>` to group content blocks
- Use the copy from `build-plan.md` exactly as written. Do not shorten, rewrite, or summarize.

**Template format:**

```
---
layout: base.njk
pageTitle: [page title from spec]
permalink: [/ for first page, /[id] for others]
---
[full HTML content from build-plan.md]
```

Use the Write tool to create each file at its exact path.

---

**If `contact.enabled = true` and `contact.type = "email"`**, also write `scaffold/src/contact.njk`:

```nunjucks
---
layout: base.njk
pageTitle: Contact
permalink: /contact
---
<section class="contact-section">
  <h1>Get in Touch</h1>
  <p>Reach us at: <a href="mailto:{{ site.contact.email }}">{{ site.contact.email }}</a></p>
</section>
```

---

**[SCRIPT]** Run the Eleventy build:

```bash
bash scripts/build-site.sh
```

If it exits with an error, show the error output clearly. Common causes: malformed Nunjucks syntax in a generated template, missing layout reference, or empty `dist/`. Fix the template(s) and re-run this script.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/build.md
git commit -m "feat: /build command definition — site.json, theme, template generation, Eleventy build"
```

---

## Task 16: .claude/commands/deploy.md

**Files:**
- Create: `.claude/commands/deploy.md`

- [ ] **Step 1: Create .claude/commands/deploy.md**

````markdown
Deploy the built Clodsite site to Cloudflare Pages.

---

**[SCRIPT]** Run the deploy script:

```bash
bash scripts/deploy.sh
```

This reads `.env`, runs `wrangler pages deploy dist`, and captures the output.

---

**If `deploy.sh` exits with a non-zero code:**

**[LLM]** Read `scripts/.deploy-error`. Interpret the error and explain clearly:
- What went wrong
- Exactly how to fix it

Common cases:
- **Authentication error:** Token has expired or lacks permissions. Run `/setup` to re-enter the token.
- **Project name conflict:** A Pages project with this slug already exists under a different account. Edit `site.name` in `site-spec.json` (changing the name changes the slug) and re-run `/deploy`.
- **dist/ missing:** Run `/build` first.
- **Wrangler not found:** Run `npm install -g wrangler`.

Do not attempt to re-run deploy automatically. Print the fix suggestion and stop.

---

**If `deploy.sh` exits with code 0:**

**[SCRIPT]** Finalize the deployment:

```bash
bash scripts/deploy-finalize.sh
```

This parses the live URL, writes it to `site-spec.json`, generates `NEXT-STEPS.md`, and prints the URL.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/deploy.md
git commit -m "feat: /deploy command definition with error interpretation and finalize"
```

---

## Task 17: CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Create CLAUDE.md**

````markdown
# Clodsite

A opinionated website-building workflow. Interview → spec → plan → build → deploy. Five commands. One live site.

## Commands

### `/setup` — `[SCRIPT]`
Collect and verify a Cloudflare API token. Write `.env`.

```
[SCRIPT] bash scripts/setup.sh
```

### `/interview` — `[LLM]`
10-question session. Produces `site-spec.json`.

```
[LLM]    Conduct interview, synthesize answers into JSON
[SCRIPT] bash scripts/write-spec.sh
```

### `/plan` — `[HYBRID]`
Validate spec. Generate build plan with approved copy. Produces `build-plan.md`.

```
[SCRIPT] bash scripts/validate-spec.sh
[LLM]    Generate build-plan.md (including copy if content_status=draft)
[SCRIPT] bash scripts/write-plan.sh
```

User reviews `build-plan.md` before running `/build`.

### `/build` — `[HYBRID]`
Write site data. Generate page templates. Run Eleventy. Produces `dist/`.

```
[SCRIPT] bash scripts/write-site-json.sh
[SCRIPT] bash scripts/apply-theme.sh
[LLM]    Generate scaffold/src/[page].njk for each page
[SCRIPT] bash scripts/build-site.sh
```

### `/deploy` — `[SCRIPT]`
Deploy to Cloudflare Pages. Produces a live URL and `NEXT-STEPS.md`.

```
[SCRIPT] bash scripts/deploy.sh
[LLM]    Interpret error if deploy fails (only on failure)
[SCRIPT] bash scripts/deploy-finalize.sh (only on success)
```

---

## Architecture: `[SCRIPT]` / `[LLM]` / `[HYBRID]`

Every step is labeled with its execution type:

| Label | What it means | Why it matters |
|-------|---------------|----------------|
| `[SCRIPT]` | Deterministic bash — same result every time | Free, fast, reliable |
| `[LLM]` | Claude inference — reasoning, generation, interpretation | Where creativity earns its cost |
| `[HYBRID]` | Script validates structure; LLM handles semantics | Best of both |

The LLM runs in four places: the interview, copy generation, template generation, and error interpretation. Everything else is a script.

---

## Files Written During a Run

| File | Written by | Purpose |
|------|-----------|---------|
| `.env` | `/setup` | Cloudflare credentials |
| `site-spec.json` | `/interview` | Machine-readable spec |
| `site-spec.md` | `/interview` | Human-readable spec |
| `build-plan.md` | `/plan` | Approved build plan (review before /build) |
| `scaffold/src/_data/site.json` | `/build` | Structural site data for Eleventy |
| `scaffold/src/*.njk` | `/build` | Page templates with content |
| `dist/` | `/build` | Built static site |
| `NEXT-STEPS.md` | `/deploy` | Post-deploy ops guide |

---

## Scope (Hackathon v1.0)

In scope: static content sites, 2–5 pages, three visual styles, Cloudflare Pages deploy.

Out of scope: `/modify`, GitHub Actions, contact form backend, custom domain automation, ecommerce.

See `docs/superpowers/specs/2026-05-13-clodsite-prd.md` for full spec.
````

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "feat: CLAUDE.md with annotated command reference and architecture table"
```

---

## Task 18: README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

````markdown
# Clodsite

**A opinionated website-building workflow for Claude Code.**

Interview → spec → plan → build → deploy. Five commands. One live site on Cloudflare Pages.

```bash
git clone https://github.com/nopolabs/clodsite my-site && cd my-site && claude
```

Then inside Claude Code:

```
/setup       collect and verify your Cloudflare API token
/interview   10-question session → site-spec.json
/plan        review and approve the build plan
/build       generate and build the site
/deploy      ship to Cloudflare Pages → live URL
```

---

## The Idea

Most AI site builders are autocomplete with a pretty UI. Clodsite is a structured process: the AI interviews you, produces a reviewable spec, and only builds after you approve. Every step is labeled `[SCRIPT]`, `[LLM]`, or `[HYBRID]`.

This isn't a rejection of vibe coding — it's a lane assignment for it. `[LLM]` steps handle what LLMs are actually good at: writing copy, interpreting tone, synthesizing interview answers, explaining errors. `[SCRIPT]` steps handle everything else: reading files, validating schemas, running CLI tools. Each approach does what it's actually good at.

```
/setup     [SCRIPT]  — bash all the way down
/interview [LLM]     — 10 questions, one JSON spec
/plan      [HYBRID]  — script validates, LLM generates copy
/build     [HYBRID]  — script writes data, LLM writes templates
/deploy    [SCRIPT]  — wrangler pages deploy + LLM error interpretation on failure
```

---

## Requirements

- [Claude Code](https://claude.ai/code)
- [Node.js](https://nodejs.org/) 18+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- A [Cloudflare account](https://dash.cloudflare.com/) (free tier works)
- A Cloudflare API token with **Cloudflare Pages: Edit** permission

---

## Output

A static site built with [Eleventy](https://www.11ty.dev/) and deployed to Cloudflare Pages. Three visual personalities: minimal, professional, bold. 2–5 pages. Your copy, or Claude drafts it.

---

## Why it works this way

Claude Code's `CLAUDE.md` loads when you open Claude Code in a directory. That means you need to be inside the cloned repo for the commands to work — hence the `&& claude` at the end of the clone command. This is a current Claude Code constraint; the natural evolution is dynamic command loading from a remote URL.

---

## Built for

[State of Oregon Claude Code Hackathon](https://luma.com/bf9gpp2z) — 2026 — by [@nopolabs](https://github.com/nopolabs)
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "feat: README with quick start, architecture explanation, and requirements"
```

---

## Task 19: Session 1 — /interview and /plan Smoke Test

*Hackathon Session 1. Goal: `/interview` → `/plan` produces a valid `build-plan.md`.*

- [ ] **Step 1: Open Claude Code in the repo**

```bash
claude
```

- [ ] **Step 2: Run /setup with your real Cloudflare token**

```
/setup
```

Expected: `.env` written, token verified.

- [ ] **Step 3: Run /interview with Test Site A**

Use this scenario: *a personal portfolio site for a freelance UX designer named Jordan Rivera. Minimal style. 3 pages: Home, Work, About. Draft copy.*

```
/interview
```

Work through the 10 questions. Verify the generated `site/site-spec.json` looks correct.

- [ ] **Step 4: Run /plan**

```
/plan
```

Expected: `site/build-plan.md` written. Open and read it. Check:
- Copy sounds right for a UX designer
- 3 pages listed with content
- Nav order correct

- [ ] **Step 5: Run validate-spec.sh independently to confirm it passes**

```bash
bash scripts/validate-spec.sh
```

Expected: `✓ Spec is valid (3 pages, style: minimal)`

- [ ] **Step 6: Fix anything that broke and commit**

```bash
git add -p   # stage only intentional changes
git commit -m "fix: session 1 smoke test fixes"
```

---

## Task 20: Session 2 — /build and /deploy Working, Full Cycle

*Hackathon Session 2. Goal: one complete run from clone to live URL.*

- [ ] **Step 1: Run /build (continuing from Session 1)**

```
/build
```

Expected: page `.njk` files written to `scaffold/src/`, Eleventy build completes, `site/dist/` is non-empty.

```bash
find site/dist -name "*.html" | sort
```

Expected: `index.html` and one file per non-home page.

- [ ] **Step 2: Preview locally**

```
/deploy local
```

This starts the Eleventy dev server. Open `http://localhost:8080` in a browser. Check: layout renders, nav works, copy looks right, theme applies correctly. Press Ctrl-C to stop.

- [ ] **Step 3: Run /deploy**

```
/deploy
```

Expected: wrangler outputs a `*.pages.dev` URL. `site/NEXT-STEPS.md` is written.

```bash
head -5 site/NEXT-STEPS.md
```

Expected: first line confirms site is live with real URL.

- [ ] **Step 4: Open the live URL and verify**

The site should be publicly accessible and visually correct.

- [ ] **Step 5: Full second cycle with Test Site B**

Different scenario: *a professional consulting firm, "Meridian Strategy Group". Professional style. 4 pages: Home, Services, Team, Contact (email). Content provided.*

Run all five commands from scratch:
```
/interview
/plan
/build
/deploy
```

Verify the live site renders correctly with the professional theme.

- [ ] **Step 6: Fix anything that broke and commit**

```bash
git add -p
git commit -m "fix: session 2 integration fixes"
```

---

## Task 21: Session 3 — Polish and Submission

*Hackathon Session 3. Goal: clean repo, recorded demo, submitted.*

- [ ] **Step 1: Run the full test suite one more time**

```bash
bash scripts/test/run-tests.sh
```

Expected: all tests pass.

- [ ] **Step 2: Audit CLAUDE.md**

Read it top to bottom. Every step should be labeled. Every script name should match what exists in `scripts/`. Fix any discrepancies.

- [ ] **Step 3: Final README pass**

Read the README as if you've never seen this project. Is the one-liner clear? Does the architecture section explain the `[SCRIPT]`/`[LLM]` idea in two sentences? Fix anything that needs it.

- [ ] **Step 4: Commit any polish changes**

```bash
git add -p
git commit -m "polish: CLAUDE.md and README final pass"
```

- [ ] **Step 5: Record demo video**

Run a full cycle on camera (or screen recording):
1. `git clone ... && cd ... && claude`
2. `/setup`
3. `/interview` (use a new, clean site concept — not one of the test sites)
4. `/plan` — show the reviewer opening `site/build-plan.md`
5. `/build`
6. `/deploy` — end on the live URL in the terminal

Keep it under 3 minutes. Show the `[SCRIPT]`/`[LLM]` labels if any are visible in terminal output.

- [ ] **Step 6: Submit**

Submit the `nopolabs/clodsite` repo link and demo video. In the writeup, mention:
- The `[SCRIPT]`/`[LLM]`/`[HYBRID]` annotation scheme
- The production argument (Model A now, Model B is the natural next step)
- Prior work context (keep it brief)
- Thank Joanna Gough in the community field

---

*End of plan.*
