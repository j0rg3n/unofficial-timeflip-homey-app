'use strict';

class MockHomeyDevice {
  constructor() {
    this._capabilities = {};
    this._settings = {};
    this._data = {};
    this._logs = {};
    this._errorFn = null;
  }

  setErrorHandler(fn) {
    this._errorFn = fn;
  }

  error(err) {
    if (this._errorFn) {
      this._errorFn(err);
    } else {
      console.error('MockHomeyDevice error:', err);
    }
  }

  log() {
    console.log.apply(console, arguments);
  }

  getData() {
    return this._data;
  }

  getSetting(key) {
    return this._settings[key];
  }

  setData(data) {
    this._data = data;
  }

  setSettings(settings) {
    for (const key in settings) {
      this._settings[key] = settings[key];
    }
  }

  async setCapabilityValue(capability, value) {
    this._capabilities[capability] = value;
    return Promise.resolve();
  }

  getCapabilityValue(capability) {
    return this._capabilities[capability];
  }

  hasCapability(capability) {
    return capability in this._capabilities;
  }

  registerCapability(capability) {
    this._capabilities[capability] = null;
  }

  createInsightLogger(id) {
    this._logs[id] = {
      createEntry: (value) => Promise.resolve(),
    };
    return this._logs[id];
  }

  getInsightLoggers() {
    return this._logs;
  }
}

module.exports = MockHomeyDevice;
