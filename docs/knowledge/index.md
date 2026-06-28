---
type: Guide
title: Clodsite Knowledge Format (OKF)
description: How Clodsite knowledge is structured as Open Knowledge Format concepts — the type vocabulary, frontmatter contract, and rules for agents creating or editing docs.
tags: [okf, knowledge, agents, conventions]
timestamp: 2026-06-28T00:00:00Z
---

# Clodsite Knowledge Format (OKF)

Clodsite organizes its written knowledge using the
[Open Knowledge Format (OKF) v0.1](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)
— a vendor-neutral, "just markdown + just files + just YAML frontmatter"
convention. The goal is a single, structured, queryable knowledge surface that
every agent (Claude, Codex, others) reads the same way. This complements
[`../../AGENTS.md`](../../AGENTS.md): `AGENTS.md` is the workflow contract; this
file defines how durable knowledge is *shaped*.

OKF is deliberately minimal. The only hard rules:

1. **One concept per markdown file.** The file path is the concept's identity.
2. **Every concept file has YAML frontmatter with a `type`** (the one required
   field). Other fields are optional.
3. **`index.md` and `log.md` are reserved** — `index.md` is a directory's entry
   point (this file is one); `log.md` is optional chronological history.
4. **Concepts link to each other with normal markdown links**, forming a graph.

## Frontmatter contract

```yaml
---
type: <required — one of the Clodsite types below>
title: <human-readable name>
description: <one-line summary; this is what an agent reads to judge relevance>
tags: [<categorical>, <tags>]
timestamp: <ISO 8601 of last meaningful update, e.g. 2026-06-28T00:00:00Z>
# Type-specific optional fields:
# status:     draft | accepted | shipped | superseded   (Spec / Plan)
# resource:   URL to the live thing                       (Site / Component)
# supersedes: [/path/to/older-concept.md]                 (Spec / Plan)
---
```

Only `type` is required. Add fields when they carry signal; don't pad.

## Type vocabulary

| `type` | What it labels | Where |
|--------|----------------|-------|
| `Guide` | Operational how-to: workflow, development, authoring, testing, themes, protocols | `AGENTS.md`, `docs/*.md` |
| `Reference` | Background, rationale, working notes | `docs/clodsite_vision_brief-final.md`, `docs/theme-system-notes.md` |
| `Spec` | A dated design record | `docs/superpowers/specs/*.md` |
| `Plan` | A dated implementation plan | `docs/superpowers/plans/*.md` |
| `Component` | A build-plan component (hero, feature-grid, …) | generated into `docs/knowledge/components/` from component schemas |
| `Theme` | A built-in visual theme | `docs/THEMES.md` + theme files *(planned)* |
| `Site` | A live deployed site (operational catalog) | generated into each site's `docs/index.md` from its `build-plan.yaml` (in the sites repo) |

Producers may add new types as the need arises — `type` defines the
interoperability surface, not a closed list.

## Rules for agents

**When you create or edit durable knowledge:**

- Add or update frontmatter. At minimum set `type`; set `title` and
  `description` so other agents can find it.
- Pick the narrowest `type` that fits. New design rationale → `Spec`/`Plan`
  (dated filename). Operational how-to → `Guide`. Background → `Reference`.
- Link related concepts with markdown links so the graph stays connected.
- Update `timestamp` when you make a meaningful change.
- For `Spec`/`Plan`, keep `status` honest, and set `supersedes` when a new record
  replaces an old one rather than silently diverging.

**Do not** retro-edit dated `Spec`/`Plan` records to match current reality —
those are history. Write a new record and link it with `supersedes`.

## Validation

Run the conformance check:

```
node scripts/lib/validate-okf.mjs        # scans AGENTS.md + docs/**.md
```

It validates every file that has frontmatter — a file *without* frontmatter is
"not yet adopted", which is reported but not an error, so adoption stays
incremental. The check is part of the test suite
(`scripts/lib/validate-okf.test.mjs`), and a test keeps the enforced type list in
lockstep with the vocabulary table above.

## Rollout status

This is an incremental adoption, not a big-bang reformat.

- **Done:** every doc on the knowledge surface carries frontmatter — `AGENTS.md`,
  the `docs/` guides and references, all dated `Spec`/`Plan` records (with
  `status` and `supersedes` set), and the generated `Component` bundle under
  `docs/knowledge/components/` (produced from component schemas by
  `scripts/generate-catalog-md.sh`); `scripts/lib/validate-okf.mjs` enforces it in
  the test suite (`✓ OKF: 84 conformant, 0 not yet adopted`).
- **Done (sites repo):** `scripts/generate-site-docs.sh` writes a `Site` concept
  into each site's `docs/index.md` from its `build-plan.yaml` (offline,
  re-runnable), and `/deploy` regenerates it automatically (in `deploy-finalize`)
  so it stays current without a manual step. Each site's `docs/` is its own OKF
  bundle (the `Site` concept plus any hand-written `Reference` notes).
- **Planned:** optionally render the bundle(s) with the OKF static visualizer.

`ROADMAP.md` tracks these as they move.
