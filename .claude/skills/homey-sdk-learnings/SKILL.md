---
name: homey-sdk-learnings
description: Homey SDK v3 / BLE / Insights / capability gotchas learned on the TimeFlip app. Use when touching flow triggers, BLE notifications, insight loggers or capabilities.
---

# Homey SDK learnings

## Flow triggers (SDK v3)
- `getTriggerCard()` returns `FlowCardTrigger` → use `trigger(tokens)` only.
- `getDeviceTriggerCard()` returns `FlowCardTriggerDevice` → use `trigger(device, tokens)`.
- Never pass a device to `getTriggerCard().trigger()`.
- Device triggers need a `device` arg with `filter: "driver_id=xxx"` in the flow JSON.

## BLE events
- `subscribeToNotifications(cb)` receives a raw Buffer; read bytes with `data[0]`.
- TimeFlip sends the facet as a single byte (1-12).
- Debounce: ignore if `this._currentFacet === facet`.

## Insights
- Use `this.homey.insight.getLoggers()`, NOT `this.homey.app.getInsightLoggers()`.
- Check `this.homey.insight` exists before calling.

## Capabilities
- Use `dim`, not `light_brightness`, for LED brightness.
- Standard light capabilities: `onoff`, `dim`, `light_hue`, `light_saturation`.
- Re-pair the device after changing capabilities; the UI does not update otherwise.
