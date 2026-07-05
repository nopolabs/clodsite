Run the **Revise** workflow documented in `AGENTS.md`.

Argument form: `/revise <site-name>`. If no site name was given, ask for one
and stop.

Follow `AGENTS.md`: normalize the site to the latest Clodsite before editing,
capture and confirm the request, make targeted authored-input changes, run
`scripts/revise-report.sh <site-name>`, present the report for approval, and
deploy only after approval.
