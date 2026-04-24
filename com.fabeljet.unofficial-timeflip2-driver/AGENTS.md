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

## BLE pairing flow

1. Driver's `onPair` calls `ble.discover()` → finds TimeFlip advertisements
2. Store `advertisement.uuid` in both `data.id` and `store.peripheralUuid`
3. Device's `onConnect` uses `ble.find(this.getStore().peripheralUuid)` to reconnect

## Key insights

- The scan ID from `ble.discover()` (e.g., "5") is **different** from the peripheral UUID. Use `advertisement.uuid` for `ble.find()`.
- **Never ask the user to disconnect/reconnect the device** on every code change — use `homey app run --remote` for rapid iteration