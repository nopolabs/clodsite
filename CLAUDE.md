# Clodsite — Claude Code entry point

**Canonical agent guidance lives in [`AGENTS.md`](AGENTS.md). Read it first.**

Claude Code auto-loads this file, but it intentionally holds no project
knowledge of its own. The workflow contract (Setup, Interview, Build, Deploy,
Domain, Teardown, Status), the architecture boundary, and the multi-agent norms
all live in `AGENTS.md` — the single source of truth every agent (Claude, Codex,
and others) shares. Claude Code additionally exposes those workflows as slash
commands (`/setup`, `/deploy`, …), which are thin triggers over the `AGENTS.md`
workflows.

> **Keep this file a pure pointer.** Do not add guidance, command behavior, or
> any other content here — it would drift from `AGENTS.md` and be invisible to
> other agents. All durable knowledge belongs in `AGENTS.md`.
