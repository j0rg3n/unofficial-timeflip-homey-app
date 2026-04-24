# CLAUDE.md — TimeFlip / Homey App Rules

This file contains project-specific rules for the TimeFlip Homey app.
Read this before making changes to this codebase.

---

## SPEC.md Rules

- SPEC.md is the source of truth for interfaces, protocol details, data shapes, and capability mappings.
- If implementation reveals the SPEC is wrong or incomplete, **update SPEC.md first**, then implement.
- Do not silently deviate from SPEC — if a spec decision turns out to be impractical, update the spec and note the reason.

---

## Testing Rules

### Coverage
- Overall coverage target: **> 65%**.
- Coverage target for pure logic modules (`HistoryParser`, `InsightsAccumulator`, `TimeFlipController`): **> 80%**.
- Do not merge a group's work if its coverage target is not met.
- Run coverage with `npm run coverage` before considering a group done.

### Test file naming
- Unit tests: `test/<ModuleName>.test.js`
- E2E tests: `test/e2e/<feature>.spec.js`
- Mocks: `test/mocks/<MockName>.js`

---

