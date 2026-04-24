# AGENTS.md — TimeFlip Homey App

## Quick reference

```bash
cd com.fabeljet.unofficial-timeflip2-driver

homey app run --remote      # Run app on Homey (use this, NOT homey app install)
npm run coverage           # Run tests with coverage
```

## Debugging

- `console.log()` output goes to Homey logs (web UI → More → Logs)
- Avoid logging sensitive data (passwords, device IDs)
- **Never ask the user to disconnect/reconnect the device** on every code change — use `homey app run --remote` for rapid iteration

## BLE pairing flow

1. Driver's `onPair` calls `ble.discover()` → finds TimeFlip advertisements
2. Store `advertisement.uuid` in both `data.id` and `store.peripheralUuid`
3. Device's `onConnect` uses `ble.find(this.getStore().peripheralUuid)` to reconnect

### Mocking
- **BLE layer**: use `MockBleClient` (see SPEC §9) to simulate all BLE interactions. Never write tests that require a real BLE peripheral.
- **Homey SDK**: use `MockHomeyDevice` to simulate all Homey SDK interactions. Never write tests that require a running Homey instance.
- **Mock state is test state**: use `mock.getSentCommands()` to assert on outgoing BLE messages. Do not inspect internal controller state directly.

## Architecture Rules

- **Never import Homey SDK in `lib/`**. If you find yourself writing `require('homey')` outside of `drivers/`, stop and restructure.
- **Never import BLE primitives in `lib/` except in TimeFlipClient.js**. `TimeFlipController` and below must work with `MockBleClient` unchanged.
- **`device.js` must remain thin**. If business logic is creeping into `device.js`, move it to `TimeFlipController`.
- **`constants.js` is the single source of truth** for all magic numbers. No hardcoded UUIDs, message type bytes, or IO type IDs outside of `constants.js` and tests.
- **Password must be re-sent on every reconnect** — the password characteristic resets on disconnect.

## Key insights

- The scan ID from `ble.discover()` (e.g., "5") is **different** from the peripheral UUID. Use `advertisement.uuid` for `ble.find()`.
