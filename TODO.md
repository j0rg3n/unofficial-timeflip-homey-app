# TODO.md — TimeFlip Homey App

Work items grouped by dependency order. Complete groups in order.

---

## Group 1: Core Infrastructure

- [x] Create constants.js with all UUIDs and command bytes per SPEC §12
- [x] Create TimeFlipClient.js BLE wrapper implementing SPEC §6 interface
- [x] Create MockBleClient for tests implementing SPEC §9 interface
- [ ] Write tests for TimeFlipClient using MockBleClient

---

## Group 2: Business Logic

- [x] Create HistoryParser.js with parse() and sumByFacet() per SPEC §7
- [x] Create InsightsAccumulator.js with daily tracking per SPEC §7
- [x] Create TimeFlipController.js orchestrating client + insights per SPEC §6 interface
- [ ] Write tests for HistoryParser, InsightsAccumulator, TimeFlipController (>80% coverage)

---

## Group 3: Homey Integration

- [ ] Create app/app.json with ble permission and device definition
- [ ] Create drivers/timeflip/driver.js with pairing flow per SPEC §10
- [ ] Create drivers/timeflip/device.js thin adapter to TimeFlipController
- [ ] Create MockHomeyDevice for tests
- [ ] Write integration tests for device.js

---

## Group 4: Flow Cards

- [ ] Implement facet_changed trigger with tokens per SPEC §8
- [ ] Implement double_tap trigger with tokens per SPEC §8
- [ ] Implement facet_is condition per SPEC §8
- [ ] Implement set_pause, set_lock, set_auto_pause, sync_time actions per SPEC §8

---

## Group 5: Device Settings

- [ ] Implement facet label settings (facet_1_label ... facet_12_label) per SPEC §9
- [ ] Implement ble_password setting per SPEC §9
- [ ] Implement double_tap_sensitivity mapping per SPEC §9
- [ ] Implement auto_pause_delay and blink_interval settings per SPEC §9

---

## Group 6: Connection Lifecycle

- [ ] Implement connect flow with password auth per SPEC §11
- [ ] Implement reconnect with history catch-up per SPEC §11
- [ ] Implement disconnect handling and scheduled reconnect with backoff
- [ ] Implement Insights writes during live session per SPEC §11

---

## Group 7: Capabilities & Insights Logs

- [ ] Implement measure_battery capability per SPEC §8
- [ ] Implement light_hue/saturation/brightness capabilities per SPEC §8
- [ ] Implement onoff capability mapping to pause per SPEC §8
- [ ] Implement locked capability per SPEC §8
- [ ] Create per-facet daily_minutes insight logs per SPEC §8
- [ ] Implement day rollover at midnight per SPEC §11