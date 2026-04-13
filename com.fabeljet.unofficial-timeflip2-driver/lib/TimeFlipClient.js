const {
  SERVICE_UUID,
  CHAR_FACETS,
  CHAR_CMD_RESULT,
  CHAR_COMMAND,
  CHAR_DOUBLE_TAP,
  CHAR_PASSWORD,
  CHAR_HISTORY,
  DEFAULT_PASSWORD,
} = require('./constants');

class TimeFlipClient {
  constructor(peripheral) {
    this.peripheral = peripheral;
    this.connected = false;
    this._facetCallback = null;
    this._doubleTapCallback = null;
    this._disconnectCallback = null;
  }

  async connect() {
    const services = await this.peripheral.discoverServices([SERVICE_UUID]);
    if (services.length === 0) {
      throw new Error('Service not found');
    }
    const service = services[0];

    this.charFacets = await service.discoverCharacteristic(CHAR_FACETS);
    this.charCmdResult = await service.discoverCharacteristic(CHAR_CMD_RESULT);
    this.charCommand = await service.discoverCharacteristic(CHAR_COMMAND);
    this.charDoubleTap = await service.discoverCharacteristic(CHAR_DOUBLE_TAP);
    this.charPassword = await service.discoverCharacteristic(CHAR_PASSWORD);
    this.charHistory = await service.discoverCharacteristic(CHAR_HISTORY);

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
    const pw = Buffer.from(password.padEnd(6, '0').slice(0, 6));
    await this.charPassword.write(pw, false);
    const result = await this.charCmdResult.read();
    return result[0] === 0x01;
  }

  async subscribeToFacets(callback) {
    this._facetCallback = callback;
    await this.charFacets.enableNotify();
    this.charFacets.on('data', (data) => {
      if (this._facetCallback) {
        this._facetCallback(data[0]);
      }
    });
  }

  async subscribeToDoubleTap(callback) {
    this._doubleTapCallback = callback;
    await this.charDoubleTap.enableNotify();
    this.charDoubleTap.on('data', (data) => {
      if (this._doubleTapCallback) {
        const value = data[0];
        const paused = value >= 128;
        const facet = paused ? value - 128 : value;
        this._doubleTapCallback(facet, paused);
      }
    });
  }

  async readBattery() {
    const systemState = await this.charSystemState?.read();
    return systemState ? systemState[0] : 0;
  }

  async readHistory(fromEventNumber) {
    const startBytes = Buffer.alloc(4);
    startBytes.writeUInt32LE(fromEventNumber, 0);
    await this.charHistory.write(startBytes, false);

    const events = [];
    let done = false;

    await this.charHistory.enableNotify();
    this.charHistory.on('data', (data) => {
      if (data[0] === 0xFF && data[1] === 0xFF && data[2] === 0xFF && data[3] === 0xFF) {
        done = true;
        return;
      }
      events.push(data);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.charHistory.disableNotify();

    return events;
  }

  async writeCommand(bytes) {
    const data = Buffer.from(bytes);
    await this.charCommand.write(data, false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result = await this.charCmdResult.read();
    return result;
  }

  on(event, callback) {
    if (event === 'disconnect') {
      this._disconnectCallback = callback;
    }
  }
}

module.exports = TimeFlipClient;