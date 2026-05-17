# Clodsite Build Plan

## Site Overview

Clodsite is a governed website-building workflow for developers and technical users who want to go from zero to a live, well-structured site without the ceremony. The site introduces and evangelizes the tool itself — its workflow, its thesis, and how to get started. Tone is friendly and technically confident: a knowledgeable friend showing you exactly how it's done. Visual style is minimal — clean, lots of whitespace, the code does the talking.

---

## Pages

### **Home** — `home`

**Purpose:** Sell Clodsite as a quick and simple way to a solid website foundation.

**Content:**

**Headline:** Five commands. One live site.

**Subheadline:** Clodsite is a structured, interview-first workflow for building and deploying websites with Claude Code. No autocomplete, no magic. Just a clean process that works.

**Intro paragraph:** Clone the repo, open Claude Code, and follow the prompts. In about twenty minutes you'll have a spec you approved, a site you reviewed, and a live URL. That's the whole thing.

**The workflow:**

```
$ git clone https://github.com/nopolabs/clodsite my-site
$ cd my-site
$ claude
> /setup       # verify your Cloudflare token
> /interview   # 10 questions → site-spec.json
> /plan        # review copy before anything is built
> /build       # generate templates, run Eleventy
> /deploy      # ship to Cloudflare Pages → live URL
```

**Architecture note:** Clodsite labels every step `[SCRIPT]`, `[LLM]`, or `[HYBRID]`. Scripts handle the deterministic work — free, fast, and reliable. Claude inference runs only where reasoning is actually needed. You can see exactly where the AI is and isn't involved.

**CTA:** [Get Started →](/getting-started)

---

### **About** — `about`

**Purpose:** Explain the Clodsite thesis: much of what we lean on AI for can and should be replaced with deterministic scripts.

**Content:**

**Headline:** English is a great programming language. It's also an expensive one.

**Opening:** Every instruction you put in a CLAUDE.md or a skills file gets processed by an LLM. That works. But a lot of those instructions — check if a file exists, read a JSON field, create a directory, run a command — aren't reasoning tasks. They're deterministic operations that a bash one-liner can handle for free, in milliseconds, with exactly the same result every time.

**The thesis:** Clodsite is built on a simple discipline: only run inference where inference is actually required. Everything else is a script.

**The annotation scheme:** Every step in a Clodsite command is labeled:

- `[SCRIPT]` — Deterministic bash. Same result every time. No tokens, no latency.
- `[LLM]` — Claude inference. Reasoning, generation, interpretation. Worth every token.
- `[HYBRID]` — Both. A script checks structure; Claude handles semantics.

This isn't an abstract principle. The CLAUDE.md and skill files show the labels explicitly, so you can see exactly where the AI earns its cost and where a script would do.

**Why it matters:** Two reasons. First, determinism: a script does the same thing every time; an LLM may not. Second, cost: at scale, inference costs compound fast. Auditing which steps actually require reasoning — and replacing the ones that don't with scripts — is a discipline that pays off in production.

**Who built this:** Clodsite came out of a 40+ year software career, recently pointed at AI agent workflows. Not tutorials, not learning exercises — actual production infrastructure. The `[SCRIPT]`/`[LLM]` discipline is a distillation of what that experience teaches: know what your tools are actually good at, and use each one accordingly.

---

### **Getting Started** — `getting-started`

**Purpose:** Show developers how to use Clodsite from clone to live site.

**Content:**

**Headline:** From zero to live in five commands.

**Prerequisites:**
- [Claude Code](https://claude.ai/code) installed
- A [Cloudflare account](https://cloudflare.com) (free tier works)
- Node.js 18+ and npm

**Step 1 — Clone the repo**

```bash
git clone https://github.com/nopolabs/clodsite my-site
cd my-site
npm install
claude
```

**Step 2 — Run the commands**

Once you're in Claude Code:

| Command | What it does |
|---------|-------------|
| `/setup` | Prompts for your Cloudflare API token, writes `.env`, verifies access |
| `/interview` | 10-question session about your site → writes `site-spec.json` |
| `/plan` | Reads your spec, generates full copy → writes `build-plan.md` for your review |
| `/build` | Populates the Eleventy scaffold with your content → builds `dist/` |
| `/deploy` | Runs `wrangler pages deploy` → live URL in about 30 seconds |

**Review checkpoints:** `/plan` produces `build-plan.md` before anything is built. Read it. If the copy isn't right, edit it before running `/build`. That's the whole review loop — no surprises after the fact.

**Cloudflare token:** When `/setup` asks for your token, create one at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) with **Cloudflare Pages: Edit** permission.

**The repo:** [github.com/nopolabs/clodsite](https://github.com/nopolabs/clodsite)

Questions? Reach out at [contact@clodsite.com](mailto:contact@clodsite.com).

---

### **Contact** — `contact`

**Purpose:** Provide a way for visitors to get in touch.

**Content:**

**Headline:** Get in touch.

**Body:** Questions about Clodsite, feedback on the workflow, or ideas for collaboration — all welcome.

**Email:** [contact@clodsite.com](mailto:contact@clodsite.com)

---

## Navigation

Nav order: Home → About → Getting Started → Contact

The contact link appears in the main navigation (`show_contact_link: true`).

---

## Contact

Contact is handled via email. The address `contact@clodsite.com` is displayed directly on the Contact page as a mailto link. No contact form.

---

## Build Notes

- **Custom domain:** `clodsite.com` — the deploy script should configure or note this; the `*.pages.dev` URL will be the initial deploy target with custom domain set up separately in Cloudflare DNS.
- **Getting Started page:** Includes a two-column table and fenced code blocks — the Nunjucks template should render these correctly; confirm Markdown-in-Nunjucks or use raw HTML table if needed.
- **[SCRIPT]/[LLM]/[HYBRID] labels:** These appear as inline code in the About and Home pages. Ensure the minimal theme styles `<code>` tags in a readable way (monospace, subtle background).
- **No contact form backend:** Contact is email-only. No form handling required.
- **Eleventy output:** All pages are static. No server-side rendering or dynamic routes needed.