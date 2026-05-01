'use strict';

const { EventEmitter } = require('events');
const HistoryParser = require('./HistoryParser');
const InsightsAccumulator = require('./InsightsAccumulator');
const {
  CMD_LOCK_ON,
  CMD_LOCK_OFF,
  CMD_PAUSE_ON,
  CMD_PAUSE_OFF,
  CMD_BRIGHTNESS,
  CMD_BLINK_INTERVAL,
  CMD_SET_COLOR,
  CMD_SET_FACET_TASK,
  CMD_READ_FACET_TASK,
  CMD_SET_DOUBLE_TAP,
  CMD_READ_DOUBLE_TAP,
  DEFAULT_PASSWORD,
  DEFAULT_BRIGHTNESS,
  DEFAULT_BLINK_INTERVAL,
  DEFAULT_DOUBLE_TAP_SENSITIVITY,
} = require('./constants');

function _uint64LE(num) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32LE(num & 0xFFFFFFFF, 0);
  buf.writeUInt32LE(Math.floor(num / 0x100000000), 4);
  return Array.prototype.slice.call(buf);
}

class TimeFlipController extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.settings = {
      blePassword: DEFAULT_PASSWORD,
      brightness: DEFAULT_BRIGHTNESS,
      blinkInterval: DEFAULT_BLINK_INTERVAL,
      doubleTapSensitivity: DEFAULT_DOUBLE_TAP_SENSITIVITY,
      autoPauseDelay: 0,
    };
    this.insights = new InsightsAccumulator();
    this._facetLabels = {};
    this._lastEventNumber = 0;
    this._currentFacet = 0;
    this._isPaused = false;
    this._isLocked = false;
    this._activeFacetStart = null;
    this._facetStartTimes = {};
  }

  async start(settings) {
    settings = settings || {};
    this.settings.blePassword = settings.blePassword || DEFAULT_PASSWORD;
    this.settings.brightness = settings.brightness || DEFAULT_BRIGHTNESS;
    this.settings.blinkInterval = settings.blinkInterval || DEFAULT_BLINK_INTERVAL;
    this.settings.doubleTapSensitivity = settings.doubleTapSensitivity || DEFAULT_DOUBLE_TAP_SENSITIVITY;
    this.settings.autoPauseDelay = settings.autoPauseDelay || 0;

    await this.client.connect();
    const pwValid = await this.client.sendPassword(this.settings.blePassword);
    if (!pwValid) {
      throw new Error('Invalid password');
    }

    await this.client.subscribeToFacets((facet) => {
      this._onFacetChange(facet);
    });

    const initialFacet = await this.client.readFacet();
    if (initialFacet > 0) {
      this._onFacetChange(initialFacet);
    }

    await this.client.subscribeToDoubleTap((facet, paused) => {
      this._onDoubleTap(facet, paused);
    });

    this.client.on('disconnect', () => {
      this.emit('disconnected');
    });

    try {
      const battery = await this.client.readBattery();
      this.emit('battery_updated', battery);
    } catch (err) {
      this.emit('battery_updated', 0);
    }

    await this._syncStatus();
  }

  async stop() {
    await this.client.disconnect();
  }

  async _syncStatus() {
    try {
      const status = await this.client.writeCommand([0x10]);
      if (status && status.length >= 2) {
        this._isLocked = status[0] === 0x01;
        this._isPaused = status[1] === 0x01;
        this.emit('lock_changed', this._isLocked);
        this.emit('pause_changed', this._isPaused);
      }
    } catch (err) {
      // non-fatal: capabilities retain their last known values
    }
  }

  async onReconnect() {
    await this._syncStatus();

    const history = await this.client.readHistory(this._lastEventNumber);
    const parsed = HistoryParser.parse(history);
    this.insights.ingestHistory(parsed);

    if (parsed.length > 0) {
      this._lastEventNumber = parsed[parsed.length - 1].eventNumber + 1;
    }

    this.emit('insights_updated', this.insights.getDailyTotals());
  }

  async onSettings(newSettings, oldSettings) {
    if (newSettings.blePassword) {
      this.settings.blePassword = newSettings.blePassword;
      if (!oldSettings || newSettings.blePassword !== oldSettings.blePassword) {
        await this.client.sendPassword(newSettings.blePassword);
      }
    }

    this._facetLabels = {};
    for (let i = 1; i <= 12; i++) {
      const label = newSettings[`facet_${i}_label`];
      if (label) {
        this._facetLabels[i] = label;
      }
    }
  }

  _onFacetChange(facet) {
    if (facet === 0) return;
    if (facet < 1 || facet > 12) {
      this.emit('error', `Invalid facet value: ${facet}`);
      return;
    }

    this._currentFacet = facet;
    this._facetStartTimes[facet] = Math.floor(Date.now() / 1000);

    const facetName = this._facetLabels[facet] || (`Facet ${facet}`);
    this.emit('facet_changed', {
      facet,
      facetName,
    });

    this.insights.setActiveFacet(facet, this._facetStartTimes[facet]);
    this.emit('insights_updated', this.insights.getDailyTotals());
  }

  _onDoubleTap(facet, paused) {
    this._isPaused = paused;
    const facetName = this._facetLabels[facet] || (`Facet ${facet}`);
    this.emit('double_tap', {
      facet,
      facetName,
      paused,
    });
    this.emit('pause_changed', paused);
  }

  async setPause(paused) {
    const cmd = paused ? CMD_PAUSE_ON : CMD_PAUSE_OFF;
    try {
      await this.client.writeCommand(cmd);
      this._isPaused = paused;
      this.emit('pause_changed', paused);
    } catch (err) {
      this.emit('error', `Failed to set pause: ${err.message}`);
    }
  }

  async setLock(locked) {
    const cmd = locked ? CMD_LOCK_ON : CMD_LOCK_OFF;
    try {
      await this.client.writeCommand(cmd);
      this._isLocked = locked;
      this.emit('lock_changed', locked);
    } catch (err) {
      this.emit('error', `Failed to set lock: ${err.message}`);
    }
  }

  async setAutoPause(delayMinutes) {
    const cmd = [0x05, (delayMinutes >> 8) & 0xFF, delayMinutes & 0xFF];
    try {
      await this.client.writeCommand(cmd);
    } catch (err) {
      this.emit('error', `Failed to set auto-pause: ${err.message}`);
    }
  }

  async syncTime() {
    const nowSec = Math.floor(Date.now() / 1000);
    const cmd = [0x08, ..._uint64LE(nowSec)];
    await this.client.writeCommand(cmd);
  }

  async setBrightness(brightness) {
    const cmd = [...CMD_BRIGHTNESS, brightness];
    await this.client.writeCommand(cmd);
    this.settings.brightness = brightness;
  }

  async setLedColor(facet, r, g, b, format = 'rgb565') {
    let cmd;
    switch (format) {
      case 'rgb565': {
        // Pack into 16-bit: 5:6:5 format (R=5 bits, G=6 bits, B=5 bits)
        const r5 = Math.floor(r * 31 / 255);
        const g6 = Math.floor(g * 63 / 255);
        const b5 = Math.floor(b * 31 / 255);
        const rgb565 = (r5 << 11) | (g6 << 5) | b5;
        cmd = [0x11, facet, (rgb565 >> 8) & 0xFF, rgb565 & 0xFF];
        break;
      }
      case 'pct': {
        // Percentage (0-100) in 16-bit
        const rPct = Math.round(r * 100 / 255);
        const gPct = Math.round(g * 100 / 255);
        const bPct = Math.round(b * 100 / 255);
        cmd = [0x11, facet, 0, rPct, 0, gPct, 0, bPct];
        break;
      }
      case '8bit': {
        // Raw 8-bit values (1 byte per channel)
        cmd = [0x11, facet, r, g, b];
        break;
      }
      default: { // '16bit' (original implementation)
        const scale = (v) => Math.round(v * 65535 / 255);
        const r16 = scale(r);
        const g16 = scale(g);
        const b16 = scale(b);
        cmd = [0x11, facet, (r16 >> 8) & 0xFF, r16 & 0xFF, (g16 >> 8) & 0xFF, g16 & 0xFF, (b16 >> 8) & 0xFF, b16 & 0xFF];
      }
    }
    await this.client.writeCommand(cmd);
  }

  async setBlinkInterval(interval) {
    const cmd = [...CMD_BLINK_INTERVAL, interval];
    await this.client.writeCommand(cmd);
    this.settings.blinkInterval = interval;
  }

  async setFacetParams(facet, taskId) {
    const cmd = [...CMD_SET_FACET_TASK, facet, taskId];
    await this.client.writeCommand(cmd);
  }

  async getFacetParams(facet) {
    const cmd = [...CMD_READ_FACET_TASK, facet];
    await this.client.writeCommand(cmd);
    return new Promise((resolve) => {
      this.client.once('facet_params', resolve);
    });
  }

  async setDoubleTapParams(params) {
    const cmd = [
      ...CMD_SET_DOUBLE_TAP,
      params.threshold || 0x20,
      params.limit || 0x10,
      params.latency || 0x20,
      params.window || 0xFF,
    ];
    await this.client.writeCommand(cmd);
  }

  async getDoubleTapParams() {
    const cmd = [...CMD_READ_DOUBLE_TAP];
    await this.client.writeCommand(cmd);
    return new Promise((resolve) => {
      this.client.once('double_tap_params', resolve);
    });
  }

  async writeRawCommand(bytes) {
    return await this.client.writeCommand(bytes);
  }

  getFacetDailyTotals() {
    return this.insights.getDailyTotals();
  }

  getCurrentFacetElapsed() {
    if (!this._currentFacet || !this._facetStartTimes[this._currentFacet]) {
      return 0;
    }
    const elapsed = Math.floor(Date.now() / 1000) - this._facetStartTimes[this._currentFacet];
    return Math.floor(elapsed / 60);
  }

  getCurrentFacet() {
    return this._currentFacet;
  }

  isPaused() {
    return this._isPaused;
  }

  isLocked() {
    return this._isLocked;
  }
}

module.exports = TimeFlipController;
