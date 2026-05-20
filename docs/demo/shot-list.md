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

Claude Code opens with an empty prompt. Type `/help`. The five-command table appears.

**Voice:**
> "Clone, cd, open Claude Code. `/help` shows the five-command sequence — that's the workflow."

---

## Shot 3 (0:30–0:45) — `/setup`

**Show:** Type `/setup`. Paste the API token when asked, paste the Account ID when asked. Verification passes.

**Voice:**
> "/setup verifies my Cloudflare credentials. A script checks that wrangler is installed, writes `.env`, and confirms the token actually works. Pure script work — no LLM cost."

---

## Shot 4 (0:45–1:30) — `/interview` (the showcase)

**Show:** `/interview`. Answer each of the 10 questions briskly using `interview-answers.md`. As answers land, the spec JSON gets written.

**Voice (over the typing):**
> "The interview. Ten questions, one at a time. This is the LLM doing what LLMs are good at — synthesizing intent from natural language into a structured JSON spec. That spec is the contract that keeps every step downstream deterministic."

*If typing drags, the voiceover continues smoothly while you catch up — viewers don't need to read every keystroke.*

---

## Shot 5 (1:30–2:00) — `/plan`

**Show:** `/plan`. validate-spec passes. Claude generates `site/build-plan.md`. Briefly open it to show real generated copy.

**Voice:**
> "/plan validates the spec — that's a script — then generates the actual page copy. That's the LLM. The build-plan is a reviewable artifact. Read it, approve it, then build."

---

## Shot 6 (2:00–2:30) — `/build` and `/deploy`

**Show:** `/build` writes Nunjucks templates, Eleventy build runs, `site/dist/` populated. `/deploy` ensures the Cloudflare Pages project exists, deploys, and prints the live URL.

**Voice:**
> "/build writes the page templates — that's the LLM — and runs Eleventy — that's a script. /deploy ensures the Pages project exists and ships the build. The live URL appears."

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
2. Copy the embed URL (`https://www.youtube.com/embed/<VIDEO_ID>`).
3. In `~/dev/clodsite-demo/scaffold/src/demo.njk`, replace the placeholder block with:

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

4. Re-run `/build`, then `/deploy`.
5. (Optional, post-hackathon) wire up the `clodsite.com` custom domain via the dashboard steps in `site/NEXT-STEPS.md`.
