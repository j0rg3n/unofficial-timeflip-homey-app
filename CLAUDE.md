> Project-specific rules for the TimeFlip Homey app

## Workflow skills (project-level, in `.claude/skills/`)

- `dev-flow` — the per-change workflow (todo, tests, smoke run, SPEC review, commit, learnings)
- `test-coverage` — coverage targets, test naming, `npm run coverage`
- `manual-ui-test` — how to validate UI-facing changes with the user
- `homey-sdk-learnings` — Flow trigger, BLE, Insights and capability gotchas

## Rules that always apply

- **SPEC.md is the goalpost.** Ask the user before changing it, and never silently deviate from it.
- Run `npm run coverage` before considering a TODO group done.
- Do not commit UI-facing changes until the user has confirmed them (see `manual-ui-test`).
- **No real people, places, events or device identifiers** in docs, comments, test data or fixtures. Use fictional or placeholder values (e.g. `aabbccddeeff`). Required publishing metadata (author in `app.json`) is the exception.
