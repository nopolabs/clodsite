Run the **Deploy** workflow documented in `AGENTS.md`.

Argument forms: `/deploy <site-name>`, `/deploy <site-name> local` (local
preview, no token), `/deploy <site-name> "<message>"` (commit subject). If no
site name was given, ask for one and stop.

Follow `AGENTS.md` for the deploy message rule, the full build-deploy pipeline,
and stage-by-stage error interpretation. Do not auto-retry on failure.
