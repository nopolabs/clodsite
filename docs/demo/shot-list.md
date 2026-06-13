# Demo Shot List — clodsite.com

**Target length:** under 3 minutes (2:45–2:55 is the sweet spot).
**Recording tool:** `Cmd+Shift+5` → "Record Entire Screen", microphone enabled.
**Plan:** two dry runs with a stopwatch, then record on the third pass.

> Adjust to taste. The narration is a script you read aloud — keep it conversational, don't sound like you're reading.

---

## Pre-recording checklist

- [ ] `pkill -f "eleventy --serve"` — kill stale dev servers
- [ ] Wrangler already installed globally (`npm install -g wrangler`)
- [ ] Cloudflare API token in a text file or clipboard, ready to paste
- [ ] Cloudflare Account ID in a text file or clipboard, ready to paste
- [ ] Do Not Disturb on; notifications off; Slack/email closed
- [ ] Terminal: clean session, readable font, simple prompt
- [ ] Browser: hide bookmarks bar, single clean tab
- [ ] `docs/demo/interview-answers.md` open in a side window for fast reference
- [ ] Working directory `~/dev`, with no existing `~/dev/clodsite-demo`

---

## Cmd-Shift-5

---

## Shot 1 (0:00–0:15) — Open

**Show:** Terminal at `~/dev`. Optionally a browser tab on `github.com/nopolabs/clodsite`.

**Voice:**
> "This is Clodsite — a Claude Code workflow that builds static websites with discipline. Every step is labeled script or LLM. The deterministic parts run as bash; the LLM only does what only an LLM can. To show it, I'm using Clodsite to build clodsite.com itself."

---

## Shot 2 (0:15–0:30) — Clone, open, `/help`

**Show:** Run the one-liner.

```bash
git clone https://github.com/nopolabs/clodsite clodsite-demo && cd clodsite-demo && claude
```

Claude Code opens with an empty prompt. **Press Shift+Tab once** — this enters auto-edit mode so file writes don't pause for approval. Then type `/help`. The five-command table appears.

**Voice:**
> "Clone, cd, open Claude Code. `/help` shows the five-command sequence — that's the workflow."

---

## Shot 3 (0:30–0:45) — `/setup`

**Show:** Type `/setup`. Paste the API token when asked, paste the Account ID when asked. Verification passes.

**Voice:**
> "/setup verifies my Cloudflare credentials. A script checks that wrangler is installed, writes `.env`, and confirms the token actually works. Pure script work — no LLM cost."

---

## Shot 4 (0:45–1:30) — `/interview` (the showcase)

**Show:** `/interview clodsite-demo`. Answer each question briskly using `interview-answers.md`. Claude confirms a short summary, then writes `build-plan.yaml` directly and validates it.

**Voice (over the typing):**
> "The interview. A handful of questions, one at a time. This is the LLM doing what LLMs are good at — synthesizing intent from natural language straight into `build-plan.yaml`. There's no intermediate format: the interview lands directly on the build contract, and a script validates it. `/interview` is optional — you can also just write `build-plan.yaml` with the agent however you like."

*If typing drags, the voiceover continues smoothly while you catch up — viewers don't need to read every keystroke.*

---

## Shot 5 (1:30–2:00) — Review the plan

**Show:** Open `build-plan.yaml`. Scroll through it to show the real generated copy, components, navigation, and contact settings.

**Voice:**
> "`build-plan.yaml` is the inference boundary — and a reviewable artifact. Everything before it is collaboration; everything after it is deterministic scripts. Read it, correct anything inline, approve it, then build."

---

## Shot 6 (2:00–2:30) — `/build` and `/deploy`

**Show:** `/build` writes Nunjucks templates, Eleventy build runs, `site/dist/` populated. `/deploy` ensures the Cloudflare Pages project exists, deploys, and prints the live URL.

**Voice:**
> "/build is pure script — it renders the page templates from `build-plan.yaml` and runs Eleventy. No LLM, no content decisions. /deploy ensures the Pages project exists and ships the build. The live URL appears."

---

## Shot 7 (2:30–2:50) — The live site

**Show:** Open the printed `*.pages.dev` URL in the browser. Show the Home page. Scroll briefly. Click to the Demo page — show the "Demo video coming soon" placeholder.

**Voice:**
> "And here it is — clodsite.com, built by Clodsite. The Demo page has a placeholder for this very video. After recording I swap the placeholder for the embed and re-deploy."

---

## Shot 8 (2:50–3:00) — Outro

**Show:** Back to the GitHub repo, or a single-line closing card.

**Voice:**
> "Repo, design notes, and roadmap at github.com/nopolabs/clodsite. Built for the State of Oregon Claude Code Hackathon. Thanks to Joanna Gough and PDX Hacks for organizing."

---

## After recording

1. Upload the `.mov` to YouTube as **unlisted**.
2. Copy your video ID from the YouTube URL (the part after `watch?v=`).
3. In `~/dev/clodsite-demo/build-plan.yaml`, find the Demo page section and replace the video placeholder description with:

   ```html
   <div class="video-wrap">
     <iframe width="100%" height="450"
             src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
             title="Clodsite demo"
             frameborder="0"
             allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
             allowfullscreen></iframe>
   </div>
   ```

   **Do not edit the generated `src/demo.njk` directly** — `/build` regenerates it from `build-plan.yaml` and will overwrite any manual edits.

4. `cd ~/dev/clodsite-demo && claude`, then `/build`, then `/deploy`.
5. (Optional, post-hackathon) wire up the `clodsite.com` custom domain via the dashboard steps in `site/NEXT-STEPS.md`.
