> Project-specific rules for the TimeFlip Homey app

## Workflow skills (project-level, in `.claude/skills/`)

- `dev-flow` — the per-change workflow (issue, tests, smoke run, SPEC review, commit, learnings)
- `test-coverage` — coverage targets, test naming, `npm run coverage`
- `manual-ui-test` — how to validate UI-facing changes with the user
- `homey-sdk-learnings` — Flow trigger, BLE, Insights and capability gotchas

## Rules that always apply

- **SPEC.md is the goalpost.** Ask the user before changing it, and never silently deviate from it.
- **Work is tracked in GitHub issues** (`j0rg3n/unofficial-timeflip-homey-app`), not in a TODO file. Use `gh issue list` / `gh issue view`. Bugs get the `bug` label; remaining publish work is in the "Publish readiness" milestone. Reference the issue in commits (`Fixes #N`).
- Run `npm run coverage` before closing an issue that changes code.
- Do not commit UI-facing changes until the user has confirmed them (see `manual-ui-test`).
- **No real people, places, events or device identifiers** in docs, comments, test data or fixtures. Use fictional or placeholder values (e.g. `aabbccddeeff`). Required publishing metadata (author in `app.json`) is the exception.
