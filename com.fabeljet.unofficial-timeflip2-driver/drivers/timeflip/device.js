'use strict';

const Homey = require('homey');
const TimeFlipController = require('../../lib/TimeFlipController');
const { DEFAULT_PASSWORD } = require('../../lib/constants');

class TimeFlipDevice extends Homey.Device {
  async onInit() {
    this.log('TimeFlipDevice has been initialized');

    this._controller = null;
    this._facetLabels = {};
    this._blePeripheral = null;

    for (let i = 1; i <= 12; i++) {
      const label = this.getSetting('facet_' + i + '_label');
      this._facetLabels[i] = label || ('Facet ' + i);
    }

    this._insightsUpdateInterval = null;
    
    this._scheduleConnection();
  }

  async _scheduleConnection() {
    let peripheralUuid = this.getStore().peripheralUuid || this.getData().id;
    this.log('Scheduling connection for peripheralUuid:', peripheralUuid);
    
    let blePeripheral;
    try {
      blePeripheral = await this.homey.ble.find(peripheralUuid);
    } catch (e) {
      this.log('ble.find failed, scanning for TimeFlip...');
      const advertisements = await this.homey.ble.discover();
      for (const [id, adv] of Object.entries(advertisements || {})) {
        const name = adv.localName || '';
        if (name.toLowerCase().includes('timeflip')) {
          peripheralUuid = adv.uuid;
          this.log('Found TimeFlip via scan, uuid:', peripheralUuid);
          blePeripheral = await this.homey.ble.find(peripheralUuid);
          break;
        }
      }
    }
    
    if (!blePeripheral) {
      this.log('Device not found, retrying in 30s...');
      this._connectTimeout = setTimeout(() => this._scheduleConnection(), 30000);
      return;
    }

    this._blePeripheral = await blePeripheral.connect();
    this.log('Connected to BLE peripheral');

    this._blePeripheral.on('disconnect', () => {
      this.log('BLE peripheral disconnected');
      this._blePeripheral = null;
      this._attemptReconnect(0).catch((err) => this.error(err));
    });

    const peripheral = this._blePeripheral;
    
    const blePassword = this.getSetting('ble_password') || DEFAULT_PASSWORD;
    const doubleTapSensitivity = this.getSetting('double_tap_sensitivity') || 'medium';
    this.log('Connecting with password');

    const CLIENT_SERVICE = 'f1196f5071a411e6bdf40800200c9a66';
    const CHAR_PASSWORD = 'f1196f5771a411e6bdf40800200c9a66';
    const CHAR_RESULT = 'f1196f5371a411e6bdf40800200c9a66';
    const CHAR_FACET = 'f1196f5271a411e6bdf40800200c9a66';
    const CHAR_DOUBLETAP = 'f1196f5571a411e6bdf40800200c9a66';
    const CHAR_CMD = 'f1196f5471a411e6bdf40800200c9a66';
    const BATTERY_SERVICE = '180f';
    const BATTERY_CHAR = '2a19';
    
    const client = {
      connected: false,
      async connect() {
        this.connected = true;
        return true;
      },
      async disconnect() {
        this.connected = false;
        await peripheral.disconnect();
      },
      async sendPassword(pw) {
        const passwordBuf = Buffer.from(String(pw).padEnd(6, '0').slice(0, 6));
        await peripheral.write(CLIENT_SERVICE, CHAR_PASSWORD, passwordBuf);
        const result = await peripheral.read(CLIENT_SERVICE, CHAR_RESULT);
        return result[0] === 0x01;
      },
      async subscribeToFacets(cb) {
        const services = await peripheral.discoverServices([]);
        const tfSvc = services.find(s => s.uuid.includes('f1196f50'));
        if (!tfSvc) throw new Error('TimeFlip service not found');
        const chars = await tfSvc.discoverCharacteristics([CHAR_FACET]);
        const char = chars[0];
        await char.subscribeToNotifications((data) => cb(data[0]));
      },
      async subscribeToDoubleTap(cb) {
        const services = await peripheral.discoverServices([]);
        const tfSvc = services.find(s => s.uuid.includes('f1196f50'));
        if (!tfSvc) throw new Error('TimeFlip service not found');
        const chars = await tfSvc.discoverCharacteristics([CHAR_DOUBLETAP]);
        const char = chars[0];
        await char.subscribeToNotifications((data) => {
          const value = data[0];
          const paused = value >= 128;
          const facet = paused ? value - 128 : value;
          cb(facet, paused);
        });
      },
      async readBattery() {
        const services = await peripheral.discoverServices([]);
        const battSvc = services.find(s => s.uuid.includes('180f'));
        if (!battSvc) return 100;
        const chars = await battSvc.discoverCharacteristics(['2a19']);
        if (!chars || !chars[0]) return 100;
        const data = await chars[0].read();
        return data ? data[0] : 100;
      },
      async readHistory(fromEvent) {
        return [];
      },
      async writeCommand(bytes) {
        await peripheral.write(CLIENT_SERVICE, CHAR_CMD, Buffer.from(bytes));
        return [0x00, 0x02];
      },
      on(event, cb) {
        if (event === 'disconnect') {
          peripheral.on('disconnect', cb);
        }
      },
    };

    this._controller = new TimeFlipController(client);

    try {
      await this._controller.start({
        blePassword: blePassword,
        doubleTapSensitivity: doubleTapSensitivity,
      });
    } catch (err) {
      this.error('Controller start failed:', err.message);
      this._attemptReconnect(0).catch((e) => this.error(e));
      return;
    }

    this._controller.on('disconnected', () => {
      this.log('Device disconnected, attempting reconnect...');
      this._attemptReconnect(0).catch((err) => this.error(err));
    });

    this._controller.on('facet_changed', (data) => {
      const tokens = { facet: data.facet, facet_name: data.facetName };
      this.setCapabilityValue('timeflip_facet', data.facet).catch((err) => this.error(err));
      this.setCapabilityValue('timeflip_facet_name', data.facetName).catch((err) => this.error(err));
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

    this._scheduleMidnightRollover();
  }

  _scheduleMidnightRollover() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    this._midnightTimeout = setTimeout(() => {
      if (this._controller) {
        this._controller.insights.resetDay();
      }
      this._scheduleMidnightRollover();
    }, msUntilMidnight);
  }

  async onDisconnect() {
    if (this._insightsUpdateInterval) {
      clearInterval(this._insightsUpdateInterval);
    }
    if (this._midnightTimeout) {
      clearTimeout(this._midnightTimeout);
    }
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
    }
    if (this._controller) {
      await this._controller.stop();
    }
  }

  async onRepair(oldSettings) {
    await this.onDisconnect();
    await this._attemptReconnect(0);
  }

  async _attemptReconnect(attempt) {
    const maxAttempts = 5;
    const baseDelay = 1000;

    if (attempt >= maxAttempts) {
      this.log('Max reconnect attempts reached');
      return;
    }

    const delay = baseDelay * (2 ** attempt);
    this._reconnectTimeout = setTimeout(async () => {
      try {
        await this.onConnect();
        this.log('Reconnected successfully');
      } catch (err) {
        this.log('Reconnect failed:', err.message);
        await this._attemptReconnect(attempt + 1);
      }
    }, delay);
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
