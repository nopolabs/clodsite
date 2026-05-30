# Clodsite Website — Content Design

**Date:** 2026-05-29
**Status:** Approved

## Goal

Reverse-engineer clodsite.com into `sites/clodsite/` using updated copy that reflects the current state of the project. The live site is stale; this rebuild corrects it.

## Approach

Write `sites/clodsite/build-plan.yaml` directly (skipping `/interview` and `/plan` since content is already known), then run `/build clodsite`. No `site-spec.json` needed — it is interview scratch-state that `/build` never touches.

## Site Metadata

- slug: `clodsite`
- name: Clodsite
- style: minimal
- tone: casual
- contact: `hello@clodsite.com` (in footer, no Contact page)

## Pages (4)

### Home
- Headline: "Describe your site. Deploy it."
- Lead: designer analogy from README
- Spec-as-boundary diagram
- Commands table (all 7: `/setup` through `/teardown` + `/domain`)
- Requirements + quick start (`git clone … && claude`)
- Origin story (Oregon hackathon)

### Design
- Headline: "Inference in. Build plan out. Deterministic from there."
- Designer / business owner handoff analogy
- Boundary diagram: `interview → site-spec.json → build-plan.yaml → scripts → dist/`
- Three-label table: `[SCRIPT]` / `[LLM]` / `[HYBRID]`
- Token economics rationale
- Longer arc: spec as portable format, inference layer decoupled from compilation

### Demo
- Headline: "How this site was built."
- Meta intro (Clodsite built its own site)
- Full `site-spec.json` code block
- Structural outline of `build-plan.yaml` (not full content — too recursive)
- Link to GitHub source

### Roadmap
- Shipped: multi-site workspaces, scaffold isolation, `/teardown`, `/domain`, sites version control, `build-plan.yaml`
- Pending: configurable `sites/` location, `/status`, script-generated templates, installable packaging, free-form interview, `/modify`, contact form, blog/calendar/gallery/ecommerce
