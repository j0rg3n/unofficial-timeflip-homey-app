---
name: dev-flow
description: Step-by-step workflow for making any code change in the TimeFlip Homey app (issue refresh, minimal change, tests, smoke run, SPEC review, commit, record learnings). Use at the start of every change.
---

# TimeFlip dev flow

Follow these steps for every change:

1. **Refresh the open work first** with `gh issue list` (and `gh issue view N`). Issues are the only task tracker; they should reference `SPEC.md` rather than restate it. Open an issue for any new bug or task before starting it.
2. **Make cohesive, minimal sets of changes.**
3. **Run automated tests and check coverage** (see the `test-coverage` skill). UI-facing changes also need manual testing (see the `manual-ui-test` skill).
4. **Smoke the app** with timestamps: `timeout 10 homey app run --remote | ts`
5. **Review code vs. `SPEC.md`** before committing. Never silently deviate; if a spec decision is impractical, ask the user.
6. **Commit** after completing steps, or even substeps, of an issue. Reference it in the message (`Fixes #N` closes it, `Refs #N` does not). Comment on the issue when it is blocked or needs user verification.
7. **Record new learnings:**
   - About Homey, the API or tooling → the app-level `CLAUDE.md` in `com.fabeljet.unofficial-timeflip2-driver/` (or the `homey-sdk-learnings` skill for SDK gotchas).
   - About the final product → `SPEC.md` (ask the user first; see below).

## SPEC.md is the goalpost

- **Ask the user before changing `SPEC.md`.**
- `SPEC.md` is the source of truth for UX, interfaces, protocol details, data shapes and capability mappings.
- GitHub issues only point into `SPEC.md`; real specifications live in `SPEC.md`.
