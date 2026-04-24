# AGENTS.md — TimeFlip Homey App

## Running the app

```bash
cd com.fabeljet.unofficial-timeflip2-driver
homey app run --remote
```

No `homey app install` needed — `--remote` runs on Homey directly.

## BLE pairing flow

1. Driver's `onPair` calls `ble.discover()` → finds TimeFlip advertisements
2. Store `advertisement.uuid` in both `data.id` and `store.peripheralUuid`
3. Device's `onConnect` uses `ble.find(this.getStore().peripheralUuid)` to reconnect

## Key insight

The scan ID from `ble.discover()` (e.g., "5") is **different** from the peripheral UUID. Use `advertisement.uuid` for `ble.find()`.