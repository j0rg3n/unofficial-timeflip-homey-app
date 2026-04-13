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
      const label = this.getSetting(`facet_${i}_label`);
      this._facetLabels[i] = label || `Facet ${i}`;
    }

    this._insightsUpdateInterval = null;
  }

  async onConnect() {
    const settings = {
      blePassword: this.getSetting('ble_password') || DEFAULT_PASSWORD,
      doubleTapSensitivity: this.getSetting('double_tap_sensitivity') || 'medium',
      autoPauseDelay: this.getSetting('auto_pause_delay') || 0,
      blinkInterval: this.getSetting('blink_interval') || 10,
    };

    const blePeripheral = await this.homey.ble.find(this.getData().id);
    if (!blePeripheral) {
      throw new Error('Device not found');
    }

    this._controller = new TimeFlipController({
      connect: async () => {
        const services = await blePeripheral.discoverServices([
          'f1196f50-71a4-11e6-bdf4-0800200c9a66',
        ]);
        const service = services[0];

        return {
          disconnect: async () => blePeripheral.disconnect(),
          sendPassword: async (pw) => {
            const char = await service.discoverCharacteristic('f1196f57-71a4-11e6-bdf4-0800200c9a66');
            await char.write(Buffer.from(pw.padEnd(6, '0').slice(0, 6)), false);
            const result = await service.discoverCharacteristic('f1196f53-71a4-11e6-bdf4-0800200c9a66').read();
            return result[0] === 0x01;
          },
          subscribeToFacets: async (cb) => {
            const char = await service.discoverCharacteristic('f1196f52-71a4-11e6-bdf4-0800200c9a66');
            await char.enableNotify();
            char.on('data', (data) => cb(data[0]));
          },
          subscribeToDoubleTap: async (cb) => {
            const char = await service.discoverCharacteristic('f1196f55-71a4-11e6-bdf4-0800200c9a66');
            await char.enableNotify();
            char.on('data', (data) => {
              const value = data[0];
              const paused = value >= 128;
              const facet = paused ? value - 128 : value;
              cb(facet, paused);
            });
          },
          readBattery: async () => {
            const char = await service.discoverCharacteristic('f1196f56-71a4-11e6-bdf4-0800200c9a66');
            const data = await char.read();
            return data[0];
          },
          readHistory: async () => [],
          writeCommand: async (bytes) => {
            const cmdChar = await service.discoverCharacteristic('f1196f54-71a4-11e6-bdf4-0800200c9a66');
            await cmdChar.write(Buffer.from(bytes), false);
            return [0x00, 0x02];
          },
          on: (event, cb) => {
            if (event === 'disconnect') {
              blePeripheral.on('disconnect', cb);
            }
          },
        };
      },
    });

    this._controller.on('facet_changed', ({ facet, facetName }) => {
      this.setCapabilityValue('timeflip:facet', facet);
      this.setCapabilityValue('timeflip:facet_name', facetName);
      this.setCapabilityValue('onoff', true);
      this.homey.app.emit('trigger:facet_changed', {
        device: this,
        tokens: { facet, facet_name: facetName },
      });
    });

    this._controller.on('double_tap', ({ facet, facetName, paused }) => {
      this.setCapabilityValue('onoff', !paused);
      this.homey.app.emit('trigger:double_tap', {
        device: this,
        tokens: { facet, facet_name: facetName, paused },
      });
    });

    this._controller.on('battery_updated', (level) => {
      this.setCapabilityValue('measure_battery', level);
    });

    this._controller.on('pause_changed', (paused) => {
      this.setCapabilityValue('onoff', !paused);
    });

    this._controller.on('lock_changed', (locked) => {
      this.setCapabilityValue('locked', locked);
    });

    this._controller.on('insights_updated', (totals) => {
      for (let i = 1; i <= 12; i++) {
        const logger = this.homey.app.getInsightLoggers()[`facet_${i}_daily_minutes`];
        if (logger) {
          logger.createEntry(totals[i]);
        }
      }
    });

    await this._controller.start(settings);

    this._insightsUpdateInterval = setInterval(() => {
      const totals = this._controller.getFacetDailyTotals();
      for (let i = 1; i <= 12; i++) {
        const logger = this.homey.app.getInsightLoggers()[`facet_${i}_daily_minutes`];
        if (logger) {
          logger.createEntry(totals[i]);
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
      this._facetLabels[i] = newSettings[`facet_${i}_label`] || `Facet ${i}`;
    }
    if (this._controller) {
      await this._controller.onSettings(newSettings, oldSettings);
    }
  }
}

module.exports = TimeFlipDevice;