class MockBleClient {
  constructor() {
    this.connected = false;
    this._facetCallback = null;
    this._doubleTapCallback = null;
    this._disconnectCallback = null;
    this._sentCommands = [];
    this._historyFixture = [];
    this._passwordResult = true;
    this._batteryLevel = 100;
    this._currentFacet = 0;
  }

  async connect() {
    this.connected = true;
    return true;
  }

  async disconnect() {
    this.connected = false;
    if (this._disconnectCallback) {
      this._disconnectCallback();
    }
  }

  async sendPassword(password) {
    this._sentCommands.push({ type: 'password', password });
    return this._passwordResult;
  }

  async subscribeToFacets(callback) {
    this._facetCallback = callback;
  }

  async readFacet() {
    return this._currentFacet || 1;
  }

  async subscribeToDoubleTap(callback) {
    this._doubleTapCallback = callback;
  }

  async readBattery() {
    return this._batteryLevel;
  }

  async readHistory(fromEventNumber) {
    if (fromEventNumber === 0) {
      return this._historyFixture;
    }
    return this._historyFixture.filter((_, i) => i >= fromEventNumber);
  }

  async writeCommand(bytes) {
    this._sentCommands.push({ type: 'command', bytes: [...bytes] });
    return [0x00, 0x02];
  }

  on(event, callback) {
    if (event === 'disconnect') {
      this._disconnectCallback = callback;
    }
  }

  simulateFacetChange(facetId) {
    this._currentFacet = facetId;
    if (this._facetCallback) {
      this._facetCallback(facetId);
    }
  }

  simulateDoubleTap(facetId, paused) {
    if (this._doubleTapCallback) {
      this._doubleTapCallback(facetId, paused);
    }
  }

  simulateDisconnect() {
    this.connected = false;
    if (this._disconnectCallback) {
      this._disconnectCallback();
    }
  }

  simulateReconnect() {
    this.connected = true;
  }

  setPasswordResult(success) {
    this._passwordResult = success;
  }

  setHistoryFixture(events) {
    this._historyFixture = events;
  }

  setBatteryLevel(level) {
    this._batteryLevel = level;
  }

  getSentCommands() {
    return this._sentCommands;
  }

  getLastSentCommand() {
    return this._sentCommands[this._sentCommands.length - 1];
  }

  reset() {
    this._sentCommands = [];
  }
}

module.exports = MockBleClient;
