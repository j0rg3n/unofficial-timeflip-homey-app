# TimeFlip 2 → Homey Pro: Homey App Specification

## Overview

A Homey App that connects a **TimeFlip 2** (12-sided BLE time-tracking cube) to **Homey Pro (2019)** via Bluetooth Low Energy, enabling home automation triggers based on which facet of the cube is facing up.

Homey Pro acts as the **BLE central** (GATT client). TimeFlip 2 is the **BLE peripheral** (GATT server). The app is built with the **Homey Apps SDK v3** (Node.js).

---

## Key Design Decisions

- **No cloud login during pairing.** The TimeFlip REST API only offers a simple email/password JWT login — no OAuth2. Asking users for their credentials is not acceptable. Cloud login is skipped entirely.
- **No facet labels from cloud.** Facet labels (task names) are stored only in TimeFlip's cloud and mobile app — there is no BLE characteristic for them on the device. Labels are entered manually by the user in Homey device settings.
- **History is read only on reconnect**, not polled continuously. During a live session, facet-change notifications maintain in-memory state. On reconnect after a disconnect, history is read from the last known event number to catch up on flips that happened while Homey was disconnected. On first connect/pair, a full history read initializes the Insights baselines.
- **LED exposed as Homey light capability** on the currently active facet. "Turn off" = pause, "Turn on" = resume — intuitive mapping.
- **Double-tap sensitivity** exposed as a single Low/Medium/High setting (not raw accelerometer registers).
- **Architecture is strictly layered** for testability: BLE client → controller (business logic) → Homey device adapter. Each layer is independently mockable.

---

## BLE Protocol

### Device Identification

TimeFlip 2 advertises with service UUID:
```
F1196F50-71A4-11E6-BDF4-0800200C9A66
```

### GATT Service & Characteristics

All characteristics are under service `F1196F50-71A4-11E6-BDF4-0800200C9A66`.

| Characteristic | UUID | Size | Properties | Purpose |
|---|---|---|---|---|
| TimeFlip events data | F1196F51-... | 20 | R, N | Event notifications (ASCII) |
| Facets | F1196F52-... | 1 | R, N | Current facet ID (1–12), 0 if undefined |
| Command result output | F1196F53-... | 20 | R | Response to commands |
| Command | F1196F54-... | 20 | R, W | Write commands (see below) |
| Double tap | F1196F55-... | 1 | N | Double-tap detected; value encodes facet + pause state |
| System state | F1196F56-... | 4 | R, N | Calibration/hardware status |
| Password | F1196F57-... | 6 | W | Must be written on every connect |
| History data | F1196F58-... | 20 | R, W, N | History read commands and streaming data |

Use full 128-bit UUIDs throughout (Homey v6+ default).

### Password

Must be written to `F1196F57` on **every connect** (the characteristic resets on disconnect).

- Default: ASCII `000000` = `[0x30, 0x30, 0x30, 0x30, 0x30, 0x30]`
- Response in `F1196F53`: first byte `0x01` = correct, `0x02` = wrong
- Command result format: `0xXX 0x02` = success, `0xXX 0x01` = error

### Facet Notifications (`F1196F52`)

- Value: 1 byte, facet ID 1–12
- `0` = facet undefined
- Subscribe to notifications; fires on every flip

### Double-Tap Notifications (`F1196F55`)

- If value < 128: facet ID, pause is **off**
- If value >= 128: facet ID = value − 128, pause is **on**

### Command Characteristic (`F1196F54`) — Full Command Reference

**Query commands** (read response from `F1196F53`):

| Command | Bytes | Response |
|---|---|---|
| Get device time | `0x07` | `0x07` + uint64 (seconds since 1970) |
| Status request | `0x10` | `0xXX 0xYY 0xZZ 0xZZ` — lock mode, pause mode, auto-pause delay (min) |
| Read facet task params | `0x14 0xNN` | `0x14 0xNN 0xPP 0xTT 0xTT 0xTT 0xTT 0xCC 0xCC 0xCC 0xCC` — facet, mode, timer limit (s), elapsed (s) |
| Read double-tap params | `0x17` | `0x17 0x3A 0xTH 0x3B 0xLI 0x3C 0xLT 0x3D 0xWD` |

**Control commands**:

| Command | Bytes | Notes |
|---|---|---|
| Lock mode on | `0x04 0x01` | Freezes tracking on current facet |
| Lock mode off | `0x04 0x02` | |
| Auto-pause delay | `0x05 0xXX 0xXX` | Minutes (0 = disabled) |
| Pause on | `0x06 0x01` | |
| Pause off | `0x06 0x02` | |
| Set device time | `0x08` + uint64 | Seconds since 1970 |
| LED brightness | `0x09 0xXX` | 1–100% |
| LED blink interval | `0x0A 0xXX` | 5–60 seconds |
| Set facet color | `0x11 0xNN 0xRR 0xRR 0xGG 0xGG 0xBB 0xBB` | Facet 0–24, RGB 2 bytes each |
| Set facet task params | `0x13 0xNN 0xPP 0xTT 0xTT 0xTT 0xTT` | Facet, mode (0=simple,1=pomodoro), timer limit (s) |
| Set device name | `0x15 0xNN 0xZZ...` | NN = char count, max 18 ASCII chars |
| Set double-tap params | `0x16 0x3A 0xTH 0x3B 0xLI 0x3C 0xLT 0x3D 0xWD` | Threshold, limit, latency, window |
| Set password | `0x30 0xZZ...` | 6 ASCII chars |
| Reset task info | `0xFE` | |
| Factory reset | `0xFF` | Erases all flash — use with extreme care |

### History Characteristic (`F1196F58`)

**Read single event:**
```
Write: 0x01 0xXX 0xXX 0xXX 0xXX   (event number, or 0xFFFFFFFF for last)
```

**Read all history from event N (streaming):**
```
Write: 0x02 0xXX 0xXX 0xXX 0xXX   (starting event number)
```
Events stream as notifications. Each 20-byte package contains multiple history blocks. Last package is all zeros (end sentinel).

**History block format** (per event):
- N event (4 bytes)
- Side / facet (1 byte) — if > 127: pause event for facet (Side − 128); if 66: accelerometer error
- Moment of flip (unix timestamp, 4 bytes)
- Duration on that side (seconds, 4 bytes)

---

## Architecture

### Layered Design

```
TimeFlipClient  ←→  TimeFlipController  ←→  HomeyDevice
  (BLE only)       (business logic only)    (Homey SDK only)
```

**No layer imports from another layer's dependencies.** `TimeFlipClient` has zero Homey imports. `TimeFlipController` has zero BLE and zero Homey imports.

### Directory Structure

```
app/
├── app.json
├── app.js
├── drivers/
│   └── timeflip/
│       ├── driver.js              # Pairing flow only
│       └── device.js              # HomeyDevice — thin adapter
├── lib/
│   ├── TimeFlipClient.js          # BLE protocol layer
│   ├── TimeFlipController.js      # Business logic layer
│   ├── HistoryParser.js           # Parses raw history bytes → structured events
│   ├── InsightsAccumulator.js     # Per-facet daily totals + extrapolation
│   └── constants.js               # UUIDs, command bytes, preset values, defaults
└── test/
    ├── mocks/
    │   ├── MockBleClient.js       # Implements TimeFlipClient interface, no real BLE
    │   └── MockHomeyDevice.js     # Implements Homey SDK Device interface
    ├── TimeFlipClient.test.js
    ├── TimeFlipController.test.js
    ├── HistoryParser.test.js
    └── InsightsAccumulator.test.js
```

### `TimeFlipClient` Interface

```js
// Construction
new TimeFlipClient(blePeripheral)

// Methods
async connect()
async disconnect()
async sendPassword(password)          // returns true/false
async subscribeToFacets(callback)     // callback(facetId: number)
async subscribeToDoubleTap(callback)  // callback(facetId: number, paused: boolean)
async readBattery()                   // returns 0–100
async readHistory(fromEventNumber)    // returns array of raw history blocks
async writeCommand(bytes)             // returns response bytes from F1196F53
on('disconnect', callback)
```

### `TimeFlipController` Interface

```js
// Construction — takes a client instance (real or mock)
new TimeFlipController(client)

// Lifecycle
async start(settings)
async stop()
async onReconnect()         // triggers history catch-up from last known event

// Settings update
async onSettings(newSettings, oldSettings)

// Upward events (EventEmitter)
on('facet_changed', ({ facet, facetName }))
on('double_tap', ({ facet, facetName, paused }))
on('battery_updated', (level))
on('insights_updated', (totalsMap))   // { 1: minutes, 2: minutes, ... }
on('pause_changed', (isPaused))
on('lock_changed', (isLocked))

// Queries
getFacetDailyTotals()         // { 1: minutes, ..., 12: minutes }
getCurrentFacetElapsed()      // minutes elapsed on current facet since last flip
```

### `HistoryParser`

Stateless utility. Input: raw 20-byte notification buffers. Output: structured event objects.

```js
HistoryParser.parse(buffers)
// Returns: [{ eventNumber, facet, timestamp, durationSeconds, isPause }]

HistoryParser.sumByFacet(events, sinceTimestamp)
// Returns: { 1: totalSeconds, ..., 12: totalSeconds }
```

### `InsightsAccumulator`

Tracks per-facet totals across a rolling day window, with extrapolation for the currently active facet.

```js
new InsightsAccumulator()
ingestHistory(parsedEvents)
setActiveFacet(facetId, sinceTimestamp)
getDailyTotals()                // includes extrapolated current-facet time
resetDay()
```

### `MockBleClient`

```js
// Simulation methods for tests
mock.simulateFacetChange(facetId)
mock.simulateDoubleTap(facetId, paused)
mock.simulateDisconnect()
mock.simulateReconnect()
mock.setPasswordResult(success)     // controls what sendPassword() returns
mock.setHistoryFixture(events)      // raw blocks returned by readHistory()
mock.setBatteryLevel(level)
```

---

## Homey Capabilities

### Standard capabilities

| Capability | Notes |
|---|---|
| `measure_battery` | Polled from battery level characteristic on connect + periodically |
| `light_hue` | Maps to current active facet's LED color |
| `light_saturation` | Maps to current active facet's LED color |
| `light_brightness` | Maps to `0x09` command (global LED brightness) |
| `onoff` | `true` = tracking active (pause off), `false` = paused. "Turn off" = pause, "Turn on" = resume |
| `locked` | Lock mode state |

### Custom capabilities

| Capability ID | Type | Notes |
|---|---|---|
| `timeflip_facet` | number (1–12) | Currently active facet |
| `timeflip_facet_name` | string | Label from device settings for current facet |

### Insights logs (one per facet)

Created as `homey:device:<id>:facet_1_daily_minutes` … `facet_12_daily_minutes`.

- Type: `number`, unit: `min`
- Updated: on reconnect history catch-up + every ~15 minutes during live session (configurable)
- Current active facet value includes extrapolated elapsed time

---

## Flow Cards

### Triggers

| ID | Title | Tokens |
|---|---|---|
| `facet_changed` | TimeFlip facet changed | `facet` (number), `facet_name` (string) |
| `double_tap` | TimeFlip double-tapped | `facet` (number), `facet_name` (string), `paused` (boolean) |
| Standard light triggers | From `light_hue`, `light_brightness`, `onoff` capabilities | — |

### Conditions

| ID | Title |
|---|---|
| `facet_is` | Facet is [facet selector 1–12] |
| `is_paused` | Tracking is paused (from `onoff` capability) |
| `is_locked` | Lock mode is on (from `locked` capability) |
| Standard light conditions | From capabilities |

### Actions

| ID | Title | Args |
|---|---|---|
| `set_pause` | Set pause mode | on/off dropdown |
| `set_lock` | Set lock mode | on/off dropdown |
| `set_auto_pause` | Set auto-pause delay | number (minutes, 0 = disabled) |
| `sync_time` | Sync device time | none |
| Standard light actions | Set color, set brightness | From capabilities |

> Note: `onoff` on/off actions naturally map to pause/resume, so no separate pause action card is strictly needed — but `set_pause` as an explicit action is clearer for automation builders.

---

## Device Settings

| Setting ID | Type | Default | Notes |
|---|---|---|---|
| `facet_1_label` … `facet_12_label` | string | `"Facet 1"` … `"Facet 12"` | Used in Flow tokens and Insights log names |
| `ble_password` | string | `"000000"` | Sent to device on every connect |
| `double_tap_sensitivity` | enum | `"medium"` | `"low"` / `"medium"` / `"high"` — maps to register presets |
| `auto_pause_delay` | number | `0` | Minutes, 0 = disabled |
| `blink_interval` | number | `10` | Seconds, 5–60 |
| `insights_update_interval` | number | `15` | Minutes between Insights writes during live session |

### Double-tap sensitivity presets

The four accelerometer registers (threshold, limit, latency, window) are written via command `0x16`. Determine sensible preset values empirically or from the TimeFlip mobile app defaults. Suggested mapping:

```js
const DOUBLE_TAP_PRESETS = {
  low:    { threshold: 0x30, limit: 0x10, latency: 0x20, window: 0xFF },
  medium: { threshold: 0x20, limit: 0x10, latency: 0x20, window: 0xFF }, // app default
  high:   { threshold: 0x10, limit: 0x08, latency: 0x10, window: 0xFF },
};
```
> These values are approximate — validate against the real device. The pytimefliplib project may document what the mobile app uses.

---

## Pairing Flow

Pairing happens entirely over BLE — no cloud login, no TimeFlip account required.

### Steps

1. **Scan** — Homey discovers BLE devices advertising `F1196F50-...`. Show list by device name.
2. **Select** — User picks their TimeFlip from the list.
3. **Enter BLE password** — Input field, pre-filled with `000000`. Homey connects, writes password to `F1196F57`, reads response from `F1196F53`.
   - `0x01` = success → proceed
   - `0x02` = wrong → show inline error, allow retry
4. **Done** — Device stored with `{ id: peripheralId }` in `getData()`, `{ blePassword: '000000' }` in `getStore()`.

### Post-pairing

User labels facets 1–12 in device settings. Insights logs are created with default names and updated on first connect.

---

## Connection Lifecycle

```
onInit()
  └─ connect()
       ├─ ble.find(peripheralId)
       ├─ advertisement.connect()
       ├─ sendPassword()
       ├─ subscribeToFacets()
       ├─ subscribeToDoubleTap()
       ├─ readBattery()
       └─ (if first connect) readHistory(0)
            (if reconnect)   readHistory(lastKnownEventNumber)

peripheral.on('disconnect')
  └─ schedule reconnect with backoff
       └─ on success: onReconnect() → readHistory(lastKnownEventNumber)
```

**Important:** The password characteristic resets on every disconnect — password must be re-sent on every reconnect.

From Homey SDK v6+, peripherals no longer auto-disconnect after 60 seconds of inactivity, so a persistent connection is maintained throughout the session.

---

## History Strategy

- On **first connect**: read full history (`0x02` from event 0) → pass to `HistoryParser` → initialize `InsightsAccumulator`
- On **reconnect**: read history from `lastKnownEventNumber` → ingest into accumulator
- During **live session**: facet-change notifications update the active facet and `setActiveFacet()` timestamp in `InsightsAccumulator`
- **Insights writes**: on schedule (default every 15 min) + after each history catch-up. `InsightsAccumulator.getDailyTotals()` includes extrapolated elapsed time for the currently active facet.
- **Day rollover**: `InsightsAccumulator.resetDay()` called at midnight (use `homey.clock`)

---

## `constants.js` Reference

```js
// Service + Characteristics
const SERVICE_UUID      = 'f1196f50-71a4-11e6-bdf4-0800200c9a66';
const CHAR_EVENTS       = 'f1196f51-71a4-11e6-bdf4-0800200c9a66';
const CHAR_FACETS       = 'f1196f52-71a4-11e6-bdf4-0800200c9a66';
const CHAR_CMD_RESULT   = 'f1196f53-71a4-11e6-bdf4-0800200c9a66';
const CHAR_COMMAND      = 'f1196f54-71a4-11e6-bdf4-0800200c9a66';
const CHAR_DOUBLE_TAP   = 'f1196f55-71a4-11e6-bdf4-0800200c9a66';
const CHAR_SYSTEM_STATE = 'f1196f56-71a4-11e6-bdf4-0800200c9a66';
const CHAR_PASSWORD     = 'f1196f57-71a4-11e6-bdf4-0800200c9a66';
const CHAR_HISTORY      = 'f1196f58-71a4-11e6-bdf4-0800200c9a66';

// Commands
const CMD_LOCK_ON        = [0x04, 0x01];
const CMD_LOCK_OFF       = [0x04, 0x02];
const CMD_PAUSE_ON       = [0x06, 0x01];
const CMD_PAUSE_OFF      = [0x06, 0x02];
const CMD_GET_TIME       = [0x07];
const CMD_STATUS         = [0x10];
const CMD_BRIGHTNESS     = (pct) => [0x09, pct];
const CMD_BLINK_INTERVAL = (sec) => [0x0A, sec];
const CMD_SET_COLOR      = (facet, r, g, b) => [0x11, facet, r>>8, r&0xFF, g>>8, g&0xFF, b>>8, b&0xFF];
const CMD_SET_TIME       = (unixSec) => { /* 0x08 + uint64 little-endian */ };
const CMD_SET_PASSWORD   = (pw) => [0x30, ...Buffer.from(pw.padEnd(6,'0').slice(0,6))];
const CMD_DOUBLE_TAP     = (th, li, lt, wd) => [0x16, 0x3A, th, 0x3B, li, 0x3C, lt, 0x3D, wd];

// Defaults
const DEFAULT_PASSWORD   = '000000';
const FACET_COUNT        = 12;
const HISTORY_END        = [0xFF, 0xFF, 0xFF, 0xFF];
```

---

## `app.json` Permissions

```json
{
  "permissions": ["homey:wireless:ble"]
}
```

---

## Implementation Notes & Learnings

### Custom Capabilities

Custom capabilities must be defined in `.homeycompose/capabilities/<capabilityId>.json`:

```json
{
  "type": "number",
  "title": { "en": "Current facet" },
  "getable": true,
  "setable": false,
  "min": 1,
  "max": 12,
  "step": 1
}
```

Then reference them in `drivers/<driver>/driver.compose.json` capabilities array.

### Valid Driver Classes

Valid values for driver `class`: `socket`, `light`, `lock`, `thermostat`, `camera`, `speaker`, `other`, etc. Use `"other"` for generic devices.

### Setting Types

Use `"text"` not `"string"` for text settings in `.homeycompose` or `driver.compose.json`.

### Dropdown Values

Dropdown values must be defined inline in `driver.compose.json`, not in `.homeycompose/app.json` driver settings.

### Pairing

Driver with `pair: [{ id: "list" }]` requires `drivers/<driver>/pair/list.html` to exist (even if empty).

### setInterval/setTimeout

Allowed in `device.js` for periodic updates and reconnect logic despite ESLint warnings — necessary for Homey.

### Publish Requirements (for App Store)

These are required when publishing but validated only at `publish` level (not `debug`):

- **Driver images** (`.driver.compose.json`):
  ```json
  "images": {
    "small": "/drivers/timeflip/assets/images/small.png",
    "large": "/drivers/timeflip/assets/images/large.png"
  }
  ```
  - `small.png`: 75x75 pixels, PNG format
  - `large.png`: 75x75 pixels, PNG format
  - Driver icons should be clean and simple (solid color + shape)

- **Energy config** (required when using `measure_battery`):
  ```json
  "energy": {
    "batteries": ["AA", "AA"]
  }
  ```
  TimeFlip 2 uses two AA batteries.

---

## Testing Notes

- Run tests with `node --test` or Jest — no Homey emulator or real device required
- `MockBleClient` is the primary test seam: simulate flips, disconnects, reconnects, history fixtures
- `MockHomeyDevice` stubs out capability sets, Flow trigger fires, settings reads — lets you assert that `device.js` wires things correctly without a real Homey
- `HistoryParser` and `InsightsAccumulator` are pure functions / stateful classes with no external dependencies — test with raw byte buffers and time fixtures
- Test the reconnect → history catch-up path explicitly: simulate disconnect, push history fixture events to mock, reconnect, assert Insights totals are correct

---

## References

- [TimeFlip BLE Protocol v4 (GitHub)](https://github.com/DI-GROUP/TimeFlip.Docs/blob/master/Hardware/TimeFlip%20BLE%20protocol%20ver4_02.06.2020.md)
- [Homey Apps SDK — BLE](https://apps.developer.homey.app/wireless/bluetooth)
- [pytimefliplib (Python reference implementation)](https://github.com/pierre-24/pytimefliplib)
- TimeFlip REST API: `https://newapi.timeflip.io/swagger-ui.html` (not used in this app)
