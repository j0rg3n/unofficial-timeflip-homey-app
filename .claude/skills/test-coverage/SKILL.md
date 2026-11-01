---
name: test-coverage
description: Coverage targets, test file naming and how to run coverage for the TimeFlip app. Use when writing tests or deciding whether a TODO group is done.
---

# Tests and coverage

Run from `com.fabeljet.unofficial-timeflip2-driver/`: `npm run coverage` (before considering a group done).

## Targets
- Overall: **> 65%**
- Pure logic modules (`HistoryParser`, `InsightsAccumulator`, `TimeFlipController`): **> 80%**
- Do not merge a group's work if its target is not met.

## Naming
- Unit tests: `test/<ModuleName>.test.js`
- E2E tests: `test/e2e/<feature>.spec.js`
- Mocks: `test/mocks/<MockName>.js`

## Test data
Use fictional, generic values only (e.g. labels like `Work`, `Meeting`; placeholder device IDs like `aabbccddeeff`). Never real people, places, events, or real device identifiers.
