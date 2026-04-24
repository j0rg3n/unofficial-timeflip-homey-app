# TODO.md — TimeFlip Homey App

**Status: Most code written, BLE connection working, needs cleanup and remaining features**

All Groups 1-7 complete ✓. Groups 8+ below are remaining work.

---

## Group 1: Core Infrastructure ✓

- [x] Create constants.js with all UUIDs and command bytes per SPEC §12
- [x] Create TimeFlipClient.js BLE wrapper implementing SPEC §6 interface
- [x] Create MockBleClient for tests implementing SPEC §9 interface
- [x] Write tests for TimeFlipClient using MockBleClient

---

## Group 2: Business Logic ✓

- [x] Create HistoryParser.js with parse() and sumByFacet() per SPEC §7
- [x] Create InsightsAccumulator.js with daily tracking per SPEC §7
- [x] Create TimeFlipController.js orchestrating client + insights per SPEC §6 interface
- [x] Write tests for HistoryParser, InsightsAccumulator, TimeFlipController (>80% coverage)

---

## Group 3: Homey Integration ✓

- [x] Create app/app.json with ble permission and device definition
- [x] Create drivers/timeflip/driver.js with pairing flow per SPEC §10
- [x] Create drivers/timeflip/device.js thin adapter to TimeFlipController
- [x] Create MockHomeyDevice for tests
- [x] Write integration tests for device.js

---

## Group 4: Flow Cards ✓

- [x] Implement facet_changed trigger with tokens per SPEC §8
- [x] Implement double_tap trigger with tokens per SPEC §8
- [x] Implement facet_is condition per SPEC §8
- [x] Implement set_pause, set_lock, set_auto_pause, sync_time actions per SPEC §8

---

## Group 5: Device Settings ✓

- [x] Implement facet label settings (facet_1_label ... facet_12_label) per SPEC §9
- [x] Implement ble_password setting per SPEC §9
- [x] Implement double_tap_sensitivity mapping per SPEC §9
- [x] Implement auto_pause_delay and blink_interval settings per SPEC §9

---

## Group 6: Connection Lifecycle ✓

- [x] Implement connect flow with password auth per SPEC §11
- [x] Implement reconnect with history catch-up per SPEC §11
- [x] Implement disconnect handling and scheduled reconnect with backoff
- [x] Implement Insights writes during live session per SPEC §11

---

## Group 7: Capabilities & Insights Logs ✓

- [x] Implement measure_battery capability per SPEC §8
- [x] Implement light_hue/saturation/brightness capabilities per SPEC §8
- [x] Implement onoff capability mapping to pause per SPEC §8
- [x] Implement locked capability per SPEC §8
- [x] Create per-facet daily_minutes insight logs per SPEC §8
- [x] Implement day rollover at midnight per SPEC §11

---

## Group 8: Cleanup & Debug Removal ✓

- [x] Remove debug scan code from app.js after pairing verified
- [x] Remove debug service discovery code from device.js
- [x] Clean up console comments and temporary logging
- [x] Add proper onSettings handler for peripheralUuid storage

---

## Group 9: Remaining Controller Methods ✓

- [x] Implement setBrightness() in TimeFlipController (CMD 0x09)
- [x] Implement setLedColor() in TimeFlipController (CMD 0x11)
- [x] Implement setBlinkInterval() in TimeFlipController (CMD 0x0A)
- [x] Implement setFacetParams() / getFacetParams() (CMD 0x13/0x14)
- [x] Implement getDoubleTapParams() / setDoubleTapParams() (CMD 0x16/0x17)
- [x] Add tests for new methods (>80% coverage)

---

## Group 10: Additional Flow Cards (Optional) ✓

- [x] Add brightness action card (LED brightness)
- [x] Add color action card (facet LED color)
- [x] Add blink_interval action card

---

## Group 11: Edge Cases & Error Handling ✓

- [x] Handle password auth failure gracefully (show error state)
- [x] Handle BLE disconnects during command write
- [x] Handle invalid facet values from device
- [x] Handle battery read failure
- [x] Add device health indicator capability

---

## Group 12: Production Readiness

- [ ] Run `npm run lint` and fix warnings
- [ ] Run `npm run typecheck` and fix errors
- [ ] Test on real device with all flow cards
- [ ] Test pairing workflow (fresh start, repair)
- [ ] Test reconnection after BLE range loss
- [ ] Verify battery reporting works
- [ ] Verify facet change triggers work
- [ ] Verify double-tap triggers work