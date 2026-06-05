# Interview Answers — clodsite.com demo

Use these to answer the 10 questions in `/interview` during the demo recording.
Keep this open in a side window or printed; the goal is rapid, deliberate answers.

> Adjust to taste — this is a starting draft. Don't agonize over wording; Claude rewrites Q9 in `/plan`.

---

## Q1. Site or brand name

Clodsite

## Q2. In one sentence, what does this site do or offer?

An opinionated Claude Code workflow that interviews you, produces a reviewable spec, and deploys a static site to Cloudflare Pages.

## Q3. Who is this site for?

Engineers building with AI agents who want a disciplined hybrid workflow — scripts and LLMs each doing what they're actually good at.

## Q4. Tone

technical

## Q5. Visual style

minimal

## Q6. Pages

Home, Design, Demo, Roadmap

## Q7. Purpose of each page

- **Home:** Introduces Clodsite — what it is, what makes it different, where to go next.
- **Design:** Explains the `[SCRIPT]`/`[LLM]`/`[HYBRID]` architecture and why deterministic parts of an AI workflow belong in scripts.
- **Demo:** Embeds the recorded video that built this very site, plus the five-command sequence as text.
- **Roadmap:** Summarizes what was deferred to v2 and why scope discipline matters.

## Q8. Copy ready or draft?

draft

## Q9. Brief for each page (Claude writes the real copy in `/plan`)

- **Home:** Hero with a one-line tagline. One paragraph explaining the lane assignment between LLM and scripts. The five-command sequence as a code block. Pointers to Design and Demo. Link to https://github.com/nopolabs/clodsite. Quick start: git clone https://github.com/nopolabs/clodsite my-site && cd my-site && claude
- **Design:** The architecture story. English is expressive but expensive to execute as inference. Scripts handle deterministic work; LLMs handle reasoning, generation, interpretation. Walk through where each runs in Clodsite. Note Model A (Claude orchestrates) is v1; Model B (a script driver calling `claude -p`) is the natural evolution.
- **Demo:** A styled placeholder block titled "Demo video — coming soon" with a brief note that this page will embed the recording of Clodsite building this site. Below, a brief written walkthrough of the five commands so the page reads usefully without the video. Use https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1 as a placeholder that will be replaced with the actual demo video after it has been created.
- **Roadmap:** One paragraph on scope discipline. A bulleted summary of v2 items — multi-site workspaces, installable skill packaging, `/modify`, `/teardown`, custom domain automation, free-form interview, contact form, ecommerce, blog/calendar/gallery page types — with a link to `ROADMAP.md`.

## Q10. Contact?

Yes — `hello@clodsite.com` (mailto link).
*(Replace with whatever address you actually want to publish.)*

## Q11. Custom domain?

Yes — `clodsite.com`

---

## After `/deploy` finishes

The site is live at `https://clodsite.pages.dev` (or whatever slug the project name resolves to). To wire up `clodsite.com`, follow the dashboard steps in `site/NEXT-STEPS.md` — that's the v1 manual flow; custom domain automation is a v2 item.
