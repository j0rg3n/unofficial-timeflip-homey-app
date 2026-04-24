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

    // No need to read explicitly - subscription fires immediately with current facet

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
  }

  async stop() {
    await this.client.disconnect();
  }

  async onReconnect() {
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

    // Always emit when starting (currentFacet=0), otherwise debounce
    if (this._currentFacet !== 0 && this._currentFacet === facet) return;

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

  async setLedColor(facet, r, g, b) {
    const cmd = [...CMD_SET_COLOR, facet, r, g, b];
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
