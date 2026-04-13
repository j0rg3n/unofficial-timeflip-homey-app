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

### Mocking
- **BLE layer**: use `MockBleClient` (see SPEC §9) to simulate all BLE interactions. Never write tests that require a real BLE peripheral.
- **Homey SDK**: use `MockHomeyDevice` to simulate all Homey SDK interactions. Never write tests that require a running Homey instance.
- **Mock state is test state**: use `mock.getSentCommands()` to assert on outgoing BLE messages. Do not inspect internal controller state directly.

### Test file naming
- Unit tests: `test/<ModuleName>.test.js`
- E2E tests: `test/e2e/<feature>.spec.js`
- Mocks: `test/mocks/<MockName>.js`

---

## Architecture Rules

- **Never import Homey SDK in `lib/`**. If you find yourself writing `require('homey')` outside of `drivers/`, stop and restructure.
- **Never import BLE primitives in `lib/` except in TimeFlipClient.js**. `TimeFlipController` and below must work with `MockBleClient` unchanged.
- **`device.js` must remain thin**. If business logic is creeping into `device.js`, move it to `TimeFlipController`.
- **`constants.js` is the single source of truth** for all magic numbers. No hardcoded UUIDs, message type bytes, or IO type IDs outside of `constants.js` and tests.
- **Password must be re-sent on every reconnect** — the password characteristic resets on disconnect.