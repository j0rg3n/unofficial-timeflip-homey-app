---
name: dev-flow
description: Step-by-step workflow for making any code change in the TimeFlip Homey app (todo refresh, minimal change, tests, smoke run, SPEC review, commit, record learnings). Use at the start of every change.
---

# TimeFlip dev flow

Follow these steps for every change:

1. **Refresh the todo list first** (`TODO.md` is an ordered list of groups; it only references `SPEC.md`).
2. **Make cohesive, minimal sets of changes.**
3. **Run automated tests and check coverage** (see the `test-coverage` skill). UI-facing changes also need manual testing (see the `manual-ui-test` skill).
4. **Smoke the app** with timestamps: `timeout 10 homey app run --remote | ts`
5. **Review code vs. `SPEC.md`** before committing. Never silently deviate; if a spec decision is impractical, ask the user.
6. **Commit** after completing steps, or even substeps, in `TODO.md`.
7. **Record new learnings:**
   - About Homey, the API or tooling → the app-level `CLAUDE.md` in `com.fabeljet.unofficial-timeflip2-driver/` (or the `homey-sdk-learnings` skill for SDK gotchas).
   - About the final product → `SPEC.md` (ask the user first; see below).

## SPEC.md is the goalpost

- **Ask the user before changing `SPEC.md`.**
- `SPEC.md` is the source of truth for UX, interfaces, protocol details, data shapes and capability mappings.
- `TODO.md` is only a pointer into `SPEC.md`; real specifications live in `SPEC.md`.
