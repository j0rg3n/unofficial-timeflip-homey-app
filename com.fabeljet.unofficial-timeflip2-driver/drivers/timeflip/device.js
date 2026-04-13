'use strict';

const Homey = require('homey');
const TimeFlipController = require('../../lib/TimeFlipController');
const { DEFAULT_PASSWORD } = require('../../lib/constants');

class TimeFlipDevice extends Homey.Device {
  async onInit() {
    this.log('TimeFlipDevice has been initialized');

    this._controller = null;
    this._facetLabels = {};

    for (let i = 1; i <= 12; i++) {
      const label = this.getSetting('facet_' + i + '_label');
      this._facetLabels[i] = label || ('Facet ' + i);
    }

    this._insightsUpdateInterval = null;
  }

  async onConnect() {
    const blePeripheral = await this.homey.ble.find(this.getData().id);
    if (!blePeripheral) {
      throw new Error('Device not found');
    }

    const blePassword = this.getSetting('ble_password') || DEFAULT_PASSWORD;
    const doubleTapSensitivity = this.getSetting('double_tap_sensitivity') || 'medium';

    const client = {
      connected: false,
      _service: null,
      async connect() {
        const services = await blePeripheral.discoverServices([
          'f1196f50-71a4-11e6-bdf4-0800200c9a66',
        ]);
        this._service = services[0];
        this.connected = true;
        return true;
      },
      async disconnect() {
        this.connected = false;
        await blePeripheral.disconnect();
      },
      async sendPassword(pw) {
        const char = await this._service.discoverCharacteristic('f1196f57-71a4-11e6-bdf4-0800200c9a66');
        await char.write(Buffer.from(String(pw).padEnd(6, '0').slice(0, 6)), false);
        const resultChar = await this._service.discoverCharacteristic('f1196f53-71a4-11e6-bdf4-0800200c9a66');
        const result = await resultChar.read();
        return result[0] === 0x01;
      },
      async subscribeToFacets(cb) {
        const char = await this._service.discoverCharacteristic('f1196f52-71a4-11e6-bdf4-0800200c9a66');
        await char.enableNotify();
        char.on('data', (data) => cb(data[0]));
      },
      async subscribeToDoubleTap(cb) {
        const char = await this._service.discoverCharacteristic('f1196f55-71a4-11e6-bdf4-0800200c9a66');
        await char.enableNotify();
        char.on('data', (data) => {
          const value = data[0];
          const paused = value >= 128;
          const facet = paused ? value - 128 : value;
          cb(facet, paused);
        });
      },
      async readBattery() {
        const char = await this._service.discoverCharacteristic('f1196f56-71a4-11e6-bdf4-0800200c9a66');
        const data = await char.read();
        return data[0];
      },
      async readHistory() {
        return [];
      },
      async writeCommand(bytes) {
        const cmdChar = await this._service.discoverCharacteristic('f1196f54-71a4-11e6-bdf4-0800200c9a66');
        await cmdChar.write(Buffer.from(bytes), false);
        return [0x00, 0x02];
      },
      on(event, cb) {
        if (event === 'disconnect') {
          blePeripheral.on('disconnect', cb);
        }
      },
    };

    this._controller = new TimeFlipController(client);

    await this._controller.start({
      blePassword: blePassword,
      doubleTapSensitivity: doubleTapSensitivity,
    });

    this._controller.on('facet_changed', (data) => {
      const tokens = { facet: data.facet, facet_name: data.facetName };
      this.setCapabilityValue('timeflip:facet', data.facet).catch((err) => this.error(err));
      this.setCapabilityValue('timeflip:facet_name', data.facetName).catch((err) => this.error(err));
      this.setCapabilityValue('onoff', true).catch((err) => this.error(err));
      this.homey.app.emit('trigger:facet_changed', { device: this, tokens: tokens });
    });

    this._controller.on('double_tap', (data) => {
      this.setCapabilityValue('onoff', !data.paused).catch((err) => this.error(err));
      this.homey.app.emit('trigger:double_tap', { device: this, tokens: data });
    });

    this._controller.on('battery_updated', (level) => {
      this.setCapabilityValue('measure_battery', level).catch((err) => this.error(err));
    });

    this._controller.on('pause_changed', (paused) => {
      this.setCapabilityValue('onoff', !paused).catch((err) => this.error(err));
    });

    this._controller.on('lock_changed', (locked) => {
      this.setCapabilityValue('locked', locked).catch((err) => this.error(err));
    });

    this._controller.on('insights_updated', (totals) => {
      for (let i = 1; i <= 12; i++) {
        const loggerId = 'facet_' + i + '_daily_minutes';
        const logger = this.homey.app.getInsightLoggers()[loggerId];
        if (logger) {
          logger.createEntry(totals[i]).catch((err) => this.error(err));
        }
      }
    });

    this._insightsUpdateInterval = setInterval(() => {
      const totals = this._controller.getFacetDailyTotals();
      for (let i = 1; i <= 12; i++) {
        const loggerId = 'facet_' + i + '_daily_minutes';
        const logger = this.homey.app.getInsightLoggers()[loggerId];
        if (logger) {
          logger.createEntry(totals[i]).catch((err) => this.error(err));
        }
      }
    }, 15 * 60 * 1000);
  }

  async onDisconnect() {
    if (this._insightsUpdateInterval) {
      clearInterval(this._insightsUpdateInterval);
    }
    if (this._controller) {
      await this._controller.stop();
    }
  }

  async onSettings(oldSettings, newSettings) {
    for (let i = 1; i <= 12; i++) {
      this._facetLabels[i] = newSettings['facet_' + i + '_label'] || ('Facet ' + i);
    }
    if (this._controller) {
      await this._controller.onSettings(newSettings, oldSettings);
    }
  }
}

module.exports = TimeFlipDevice;
