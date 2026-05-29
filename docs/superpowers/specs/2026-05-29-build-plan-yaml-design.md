# Build Plan YAML Format Design

**Date:** 2026-05-29
**Status:** Approved

---

## Problem

`build-plan.json` stores `pages[].content` as a Markdown string with `\n` escape sequences embedded in a JSON string value. This is hard to read when reviewing a plan before running `/build`. The format also doesn't specify which Markdown dialect is used, leaving the HTML mapping partially ambiguous.

---

## Design

### Container format: JSON → YAML

`build-plan.json` is renamed to `build-plan.yaml`. Structural fields (slug, name, style, tone, nav, contact, build_notes) use YAML plain scalars and sequences. The `overview` field uses a folded block scalar (`>-`) for multi-sentence paragraphs. Each `pages[].content` field uses a literal block scalar (`|`), which preserves newlines exactly — the correct behavior for GFM.

Example:

```yaml
slug: nopolabs
name: Nopo Labs
overview: >-
  nopolabs is a minimal landing page for a personal lab — a place to build
  tools, run experiments, and ship open-source projects. Audience is developers.
  Tone is casual and direct.
style: minimal
tone: casual
pages:
  - id: home
    title: Home
    content: |
      A personal lab for building tools, experiments, and things that seem worth making.

      ## Projects

      ### [ndig](https://github.com/nopolabs/ndig)
      A command-line DNS lookup tool that queries authoritative nameservers directly.
nav:
  order:
    - home
contact:
  enabled: false
build_notes: ""
```

`site-spec.json` remains JSON — only the build plan changes format.

### Markup language: Markdown → GFM

Page content is explicitly GitHub Flavored Markdown (GFM): CommonMark base plus tables (pipe syntax), strikethrough, and task lists. GFM has a [canonical spec](https://github.github.com/gfm/) and a canonical parser (`marked` or `micromark`). LLM generation quality is highest for GFM since the overwhelming majority of LLM training data uses it.

The `/plan` LLM prompt is updated to specify GFM and show the YAML block scalar format for content. The `/build` LLM prompt is updated to reference `build-plan.yaml`; the conversion job (GFM → HTML) is unchanged.

### Parser: JSON.parse → js-yaml

All scripts that parse the build plan switch from `JSON.parse` to `require('js-yaml').load`. `js-yaml` v4 loads in safe mode by default (no `!!js/function` or other unsafe tags). The `yaml.dump()` call in `finalize-plan.sh` (which writes the plan back after injecting `name`) uses `{ lineWidth: -1 }` to prevent hard-wrapping long content lines.

`js-yaml` is added to `package.json` as a project dependency.

---

## Full change surface

| File | Change |
|---|---|
| `package.json` | Add `js-yaml` dependency |
| `scripts/validate-plan.sh` | Parse `build-plan.yaml` with js-yaml; update PLAN var |
| `scripts/finalize-plan.sh` | Parse and write `build-plan.yaml` with js-yaml |
| `scripts/write-site-json.sh` | Parse `build-plan.yaml` with js-yaml |
| `scripts/apply-theme.sh` | Parse `build-plan.yaml` with js-yaml |
| `scripts/test/fixtures/valid-build-plan.yaml` | New YAML fixture |
| `scripts/test/fixtures/valid-build-plan.json` | Deleted |
| `scripts/test/fixtures/invalid-build-plan-missing-content.yaml` | New YAML fixture |
| `scripts/test/fixtures/invalid-build-plan-missing-content.json` | Deleted |
| `scripts/test/run-tests.sh` | Copy `.yaml` fixtures; delete old `.json` fixture references |
| `.claude/commands/plan.md` | Schema becomes YAML; content rules specify GFM + block scalar |
| `.claude/commands/build.md` | Reference `build-plan.yaml`; update pageTitle comment |
| `CLAUDE.md` | Update `/plan` sequence and Files Written table |
| `sites/nopolabs/build-plan.yaml` | Migrated from `.json` |
| `sites/ndig/build-plan.yaml` | Migrated from `.json` |
| `sites/nopolabs/build-plan.json` | Deleted |
| `sites/ndig/build-plan.json` | Deleted |

---

## What does not change

- `site-spec.json` format — stays JSON
- The schema fields of `build-plan` — same fields, same validation rules
- `validate-plan.sh` validation logic — same checks, different parser
- `finalize-plan.sh` injection logic — same: reads spec name, injects into plan
- The `/build` LLM conversion job — GFM → HTML, same as before
- Eleventy `.njk` templates, `site.json`, theme files — unchanged
