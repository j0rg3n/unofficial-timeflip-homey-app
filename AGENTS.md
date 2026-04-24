> This file contains project-specific rules for the TimeFlip Homey app

## Dev flow

Follow these steps for every change you make:

1. Refresh the todo list first

2. Make cohesive, minimal sets of changes

3. Run tests and check coverage.

4. Use `timeout 10 homey app run --remote` to smoke the app.

5. Commit after completing steps or even substeps in TODO.md.

6. Record new learnings: 
   
   1. About Homey, the API, or tooling: Goes in AGENTS.md.
   
   2. About the final product: Goes in SPEC.md.

## SPEC.md is the goalpost

**Ask the user before changing `SPEC.md`.**

- `TODO.md` has an ordered list of groups of work, each group can be done in parallel

- `TODO.md` is just a reference to `SPEC.md`, where the actual specifications go.

- Do not silently deviate from SPEC — if a spec decision turns out to be impractical, ask the user what to do.

- SPEC.md is the source of truth for UX, interfaces, protocol details, data shapes, and capability mappings.

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

## Key Learnings

### Flow Triggers (SDK v3)

- `getTriggerCard()` returns `FlowCardTrigger` → use `trigger(tokens)` only
- `getDeviceTriggerCard()` returns `FlowCardTriggerDevice` → use `trigger(device, tokens)`
- Never pass device to `getTriggerCard().trigger()`

### BLE Events

- `subscribeToNotifications(cb)` callback receives raw Buffer, access bytes with `data[0]`
- TimeFlip sends facet as single byte (1-12)
- Add debounce: ignore if `this._currentFacet === facet`

### Insights

- Use `this.homey.insight.getLoggers()` NOT `this.homey.app.getInsightLoggers()`
- Check `this.homey.insight` exists before calling

### Capabilities

- Use `dim` not `light_brightness` for LED brightness control
- Standard light capabilities: `onoff`, `dim`, `light_hue`, `light_saturation`
