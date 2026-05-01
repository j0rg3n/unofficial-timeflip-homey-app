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
    this._currentHue = 0;
    this._currentSat = 0;
    this._colorUpdateTimer = null;

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
    this._logSessionInfo(this._blePeripheral).catch(() => {});

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
    const CHAR_EVENTS = 'f1196f5171a411e6bdf40800200c9a66';
    const CHAR_PASSWORD = 'f1196f5771a411e6bdf40800200c9a66';
    const CHAR_RESULT = 'f1196f5371a411e6bdf40800200c9a66';
    const CHAR_FACET = 'f1196f5271a411e6bdf40800200c9a66';
    const CHAR_DOUBLETAP = 'f1196f5571a411e6bdf40800200c9a66';
    const CHAR_CMD = 'f1196f5471a411e6bdf40800200c9a66';
    const BATTERY_SERVICE = '180f';
    const BATTERY_CHAR = '2a19';
    const CHAR_SYSTEM_STATE = 'f1196f5671a411e6bdf40800200c9a66';
    
    const log = this.log.bind(this);
    const client = {
      connected: false,
      _cmdQueue: Promise.resolve(),
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
        log('[BLE] Sending password bytes: ' + Array.from(passwordBuf).map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        await peripheral.write(CLIENT_SERVICE, CHAR_PASSWORD, passwordBuf);
        await new Promise((resolve) => setTimeout(resolve, 400));
        const events = await peripheral.read(CLIENT_SERVICE, CHAR_EVENTS);
        const eventsStr = Buffer.from(events).toString('ascii').replace(/[^\x20-\x7e]/g, '?');
        log('[BLE] Password auth result (CHAR_EVENTS): ' + eventsStr);
        return !eventsStr.includes('password error');
      },
      async readFacet() {
        const services = await peripheral.discoverServices([]);
        const tfSvc = services.find(s => s.uuid.includes('f1196f50'));
        if (!tfSvc) throw new Error('TimeFlip service not found');
        const chars = await tfSvc.discoverCharacteristics([CHAR_FACET]);
        if (!chars || !chars[0]) return 1;
        const data = await chars[0].read();
        return data ? data[0] : 1;
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
        const battSvc = services.find(s => s.uuid.toLowerCase().includes('180f'));
        if (!battSvc) return 100;
        const chars = await battSvc.discoverCharacteristics(['00002a1900001000800000805f9b34fb']);
        if (!chars || !chars[0]) return 100;
        const data = await chars[0].read();
        return data ? data[0] : 100;
      },
      async readEvents() {
        const data = await peripheral.read(CLIENT_SERVICE, CHAR_EVENTS);
        return Array.from(data).map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' ')
          + ' ("' + Buffer.from(data).toString('ascii').replace(/[^\x20-\x7e]/g, '?') + '")';
      },
      async probePassword(rawBytes) {
        log('[BLE] Probing password: ' + rawBytes.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        await peripheral.write(CLIENT_SERVICE, CHAR_PASSWORD, Buffer.from(rawBytes));
        await new Promise((resolve) => setTimeout(resolve, 400));
        const events = await peripheral.read(CLIENT_SERVICE, CHAR_EVENTS);
        const eventsStr = Buffer.from(events).toString('ascii').replace(/[^\x20-\x7e]/g, '?');
        const resultBuf = await peripheral.read(CLIENT_SERVICE, CHAR_RESULT);
        const resultHex = Array.from(resultBuf).map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        return { eventsStr, resultHex, accepted: !eventsStr.includes('password error') };
      },
      async readHistory(fromEvent) {
        return [];
      },
      async writeCommand(bytes) {
        this._cmdQueue = this._cmdQueue.then(() => this._writeCommandInternal(bytes));
        return await this._cmdQueue;
      },
      async _writeCommandInternal(bytes) {
        log('[BLE] Write command: ' + bytes.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        await peripheral.write(CLIENT_SERVICE, CHAR_CMD, Buffer.from(bytes));

        await new Promise((resolve) => setTimeout(resolve, 200));

        try {
          // Read actual command result from device
          const result = await peripheral.read(CLIENT_SERVICE, CHAR_RESULT);
          log('[BLE] Command result: ' + Array.from(result).map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' '));
          return result;
        } catch (err) {
          log('[BLE] Failed to read command result: ' + err.message);
          return [0x00, 0x01]; // Return error
        }
      },
      on(event, cb) {
        if (event === 'disconnect') {
          peripheral.on('disconnect', cb);
        }
      },
    };

this._controller = new TimeFlipController(client);

    let _lastSetFacet = null;
    this._controller.on('facet_changed', (data) => {
      if (!data) return;
      const facetNum = parseInt(data.facet, 10);
      if (isNaN(facetNum)) return;
      if (facetNum === _lastSetFacet) {
        console.log('debounce: same facet', facetNum, '- ignoring');
        return;
      }
      _lastSetFacet = facetNum;
      console.log('setting facet to', facetNum);
      const facetName = String(data.facetName || `Facet ${facetNum}`);
      const tokens = { facet: facetNum, facet_name: facetName };
      this.setCapabilityValue('timeflip_facet', facetNum).catch((err) => this.error(err));
      this.setCapabilityValue('timeflip_facet_name', facetName).catch((err) => this.error(err));
      this.setCapabilityValue('onoff', true).catch((err) => this.error(err));
      this.homey.app.emit('trigger:facet_changed', { device: this, tokens });
      this._applyColorToFacet(facetNum);
    });

    this._controller.on('double_tap', (data) => {
      if (!data) return;
      const facetNum = parseInt(data.facet, 10);
      if (isNaN(facetNum)) return;
      const facetName = String(data.facetName || `Facet ${facetNum}`);
      const tokens = { facet: facetNum, facet_name: facetName, paused: Boolean(data.paused) };
      this.setCapabilityValue('onoff', !data.paused).catch((err) => this.error(err));
      this.homey.app.emit('trigger:double_tap', { device: this, tokens });
    });

    this._controller.on('battery_updated', (level) => {
      this.setCapabilityValue('measure_battery', level).catch((err) => this.error(err));
    });

    this._controller.on('disconnected', () => {
      this.log('Device disconnected, attempting reconnect...');
      this._attemptReconnect(0).catch((err) => this.error(err));
    });

    this._controller.on('pause_changed', (paused) => {
      this.setCapabilityValue('onoff', !paused).catch((err) => this.error(err));
    });

    this._controller.on('lock_changed', (locked) => {
      this.setCapabilityValue('locked', locked).catch((err) => this.error(err));
    });

    this._controller.on('insights_updated', (totals) => {
      if (!this.homey || !this.homey.insight) return;
      for (let i = 1; i <= 12; i++) {
        const loggerId = 'facet_' + i + '_daily_minutes';
        const logger = this.homey.insight.getLoggers()[loggerId];
        if (logger) {
          logger.createEntry(totals[i]).catch(() => {});
        }
      }
    });

    // In BLE test mode, run diagnostic sequence BEFORE sending the password —
    // this avoids the 15-second kick the device gives after a wrong password
    // and gives the probe time to find the correct password or trigger a reset.
    if (this.getSetting('ble_test_mode')) {
      this.log('[TEST] BLE test mode: running diagnostic sequence before normal auth');
      this._runBleTestSequence().catch((err) => this.error('[TEST] sequence failed:', err.message));
      return;
    }

    this.log('Starting controller with blePassword:', blePassword ? '***' : 'empty');
    try {
      await this._controller.start({ blePassword });
      this.log('Controller started successfully');
      this._currentHue = await this.getCapabilityValue('light_hue') || 0;
      this._currentSat = await this.getCapabilityValue('light_saturation') || 0;
      this.log(`Initialized color state: H=${this._currentHue} S=${this._currentSat}`);

      // Read system state to check if color sync is needed
      try {
        const systemState = await peripheral.read(CLIENT_SERVICE, CHAR_SYSTEM_STATE);
        this.log('[BLE] System state: ' + Array.from(systemState).map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      } catch (err) {
        this.log('[BLE] Failed to read system state: ' + err.message);
      }

      if (this.getSetting('ble_debug_mode')) {
        this._dumpAllCharacteristics(peripheral).catch((err) => this.log('[DEBUG] Char dump failed:', err.message));
      }

      if (this.getSetting('ble_test_mode')) {
        this._runBleTestSequence().catch((err) => this.error('[TEST] sequence failed:', err.message));
      }
    } catch (err) {
      this.error('Failed to start controller:', err.message);
    }

    this.registerCapabilityListener('dim', async (value) => {
      const brightness = Math.round(value * 100);
      try {
        await this._controller.setBrightness(brightness);
      } catch (err) {
        this.error('Failed to set brightness:', err.message);
      }
    });

    this.registerCapabilityListener('light_hue', async (value) => {
      this._currentHue = value;
      this._scheduleColorUpdate();
    });

    this.registerCapabilityListener('light_saturation', async (value) => {
      this._currentSat = value;
      this._scheduleColorUpdate();
    });

    this.registerCapabilityListener('onoff', async (value) => {
      const paused = !value;  // onoff=true means NOT paused
      await this._controller.setPause(paused);
    });

    this.registerCapabilityListener('locked', async (value) => {
      await this._controller.setLock(value);
    });

    this._initCapabilities();

    this._insightsUpdateInterval = setInterval(() => {
      if (!this.homey || !this.homey.insight) return;
      const totals = this._controller.getFacetDailyTotals();
      for (let i = 1; i <= 12; i++) {
        const loggerId = 'facet_' + i + '_daily_minutes';
        const logger = this.homey.insight.getLoggers()[loggerId];
        if (logger) {
          logger.createEntry(totals[i]).catch(() => {});
        }
      }
    }, 15 * 60 * 1000);

    this._scheduleMidnightRollover();
  }

  async _initCapabilities() {
    this.setCapabilityValue('locked', false).catch(() => {});
    this.setCapabilityValue('onoff', true).catch(() => {});
    this.setCapabilityValue('dim', 1).catch(() => {});
    this.setCapabilityValue('light_hue', 0).catch(() => {});
    this.setCapabilityValue('light_saturation', 0).catch(() => {});
    this.setCapabilityValue('timeflip_facet', 1).catch(() => {});
    this.setCapabilityValue('timeflip_facet_name', 'Facet 1').catch(() => {});
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

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    for (let i = 1; i <= 12; i++) {
      const labelKey = 'facet_' + i + '_label';
      const newLabel = newSettings[labelKey] || ('Facet ' + i);
      const oldLabel = (oldSettings && oldSettings[labelKey]) || ('Facet ' + i);
      this._facetLabels[i] = newLabel;
      if (newLabel !== oldLabel) {
        this.homey.app.emit('trigger:facet_label_changed', {
          device: this,
          tokens: { facet: i, facet_name: newLabel },
        });
      }
    }
    if (this._controller) {
      await this._controller.onSettings(newSettings, oldSettings);
    }
  }

  hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  async _runBleTestSequence() {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = (msg) => this.log(`[TEST] ${msg}`);
    const ok = (msg) => this.log(`[TEST] PASS  ${msg}`);
    const fail = (msg) => this.error(`[TEST] FAIL  ${msg}`);

    // Control commands (brightness, pause, color) do NOT update CHAR_RESULT.
    // Only query commands (0x10 status, 0x07 time, 0x14 facet params) do.
    // fire() sends a control command and logs it — no PASS/FAIL from CHAR_RESULT.
    // queryStatus() sends 0x10 and reads the 4-byte status response for verification.
    const fire = async (label, bytes, expectDesc) => {
      const hex = bytes.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' ');
      step(`${label} → [${hex}]`);
      step(`  Observe: ${expectDesc}`);
      try {
        await this._controller.writeRawCommand(bytes);
        step(`  Sent OK`);
      } catch (err) {
        fail(`${label} threw: ${err.message}`);
      }
    };

    const queryStatus = async (label) => {
      try {
        const res = await this._controller.writeRawCommand([0x10]);
        const hex = Array.from(res).map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        // Expected: [lockMode, pauseMode, autoPauseHi, autoPauseLo]
        // 0x01 = ON, 0x02 = OFF (matches CMD_LOCK_ON/OFF and CMD_PAUSE_ON/OFF second bytes)
        const lockStr = res[0] === 0x01 ? 'LOCKED' : res[0] === 0x02 ? 'unlocked' : `0x${(res[0] || 0).toString(16)}`;
        const pauseStr = res[1] === 0x01 ? 'PAUSED' : res[1] === 0x02 ? 'running' : `0x${(res[1] || 0).toString(16)}`;
        step(`  ${label} status: lock=${lockStr} pause=${pauseStr} raw=[${hex}]`);
        return res;
      } catch (err) {
        fail(`Status query threw: ${err.message}`);
        return [];
      }
    };

    step('');
    step('╔══════════════════════════════════════════════════╗');
    step('║          BLE TEST SEQUENCE STARTING              ║');
    step('╚══════════════════════════════════════════════════╝');
    step('Keep the TimeFlip in BLE range and watch its LED.');
    step('Control commands have no CHAR_RESULT response —');
    step('device observation is the only ground truth for');
    step('brightness and color. Pause/lock verified via STATUS.');
    step('');

    // ── Step 0: try set-password blind (no prior auth) ───────────────────────
    // CMD 0x30 0xNN×6 = "set password". If the device allows this without auth,
    // we can force the password to "000000" and then authenticate normally.
    step('── Step 0: Blind set-password attempt (CMD 0x30) ──────────────────');
    step('Sending [0x30 0x30×6] = "set password to 000000" without prior auth.');
    step('If accepted, a subsequent probe should then show "password ok".');
    try {
      await this._controller.client.writeCommand([0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30]);
      await sleep(600);
      const eventsAfterSetPw = await this._controller.client.readEvents();
      step(`  CHAR_EVENTS after blind set-password: ${eventsAfterSetPw}`);
    } catch (err) {
      fail(`  Blind set-password threw: ${err.message}`);
    }

    // ── Step 0b: try factory reset blind ─────────────────────────────────────
    step('── Step 0b: Blind factory reset attempt (CMD 0xFF) ────────────────');
    step('Sending [0xFF] = factory reset without prior auth.');
    step('If it works, device should reboot; reconnect and retry "000000".');
    try {
      await this._controller.client.writeCommand([0xFF]);
      await sleep(2000);
      const eventsAfterReset = await this._controller.client.readEvents();
      step(`  CHAR_EVENTS after blind factory reset: ${eventsAfterReset}`);
    } catch (err) {
      step(`  Blind factory reset threw (may be expected): ${err.message}`);
    }
    await sleep(1000);

    // ── Password probe ────────────────────────────────────────────────────────
    step('── Password probe ───────────────────────────────────────────────────');
    step('Trying password encodings. Reading CHAR_EVENTS after each.');
    step('"password error" = rejected; anything else = accepted.');
    // Device MAC: e9edcdaffa14
    let workingPassword = null;
    const passwordCandidates = [
      { name: 'ASCII "000000" (0x30×6)', bytes: [0x30, 0x30, 0x30, 0x30, 0x30, 0x30] },
      { name: 'Binary zeros (0x00×6)', bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00] },
      { name: 'ASCII "123456"', bytes: [0x31, 0x32, 0x33, 0x34, 0x35, 0x36] },
      { name: 'MAC bytes raw [e9 ed cd af fa 14]', bytes: [0xe9, 0xed, 0xcd, 0xaf, 0xfa, 0x14] },
      { name: 'MAC as ASCII "e9edcd"', bytes: [0x65, 0x39, 0x65, 0x64, 0x63, 0x64] },
      { name: 'ASCII "000000" padded to 4 bytes', bytes: [0x30, 0x30, 0x30, 0x30] },
      { name: 'ASCII "111111"', bytes: [0x31, 0x31, 0x31, 0x31, 0x31, 0x31] },
      { name: 'ASCII "TimeFlip"', bytes: [0x54, 0x69, 0x6d, 0x65, 0x46, 0x6c] },
    ];
    for (const candidate of passwordCandidates) {
      try {
        const { eventsStr, resultHex, accepted } = await this._controller.client.probePassword(candidate.bytes);
        if (accepted) {
          ok(`Password ${candidate.name}: ACCEPTED — CHAR_EVENTS="${eventsStr}" CHAR_RESULT=[${resultHex}]`);
          workingPassword = candidate;
          break;
        } else {
          fail(`Password ${candidate.name}: REJECTED — CHAR_EVENTS="${eventsStr}" CHAR_RESULT=[${resultHex}]`);
        }
      } catch (err) {
        fail(`Password ${candidate.name}: threw — ${err.message}`);
      }
      await sleep(500);
    }
    if (!workingPassword) {
      fail('No password format was accepted. All subsequent tests will fail. Check ble_password setting.');
    } else {
      step(`Using accepted password for remainder of test: ${workingPassword.name}`);
    }
    await sleep(1000);

    // ── Baseline status ───────────────────────────────────────────────────────
    step('── Baseline STATUS query (0x10) ────────────────────────────────────');
    await queryStatus('Baseline');
    await sleep(1000);

    // ── Test 1: Brightness ────────────────────────────────────────────────────
    step('');
    step('── Test 1: Brightness (cmd 0x09 0xNN) — watch LED brightness ───────');
    for (const [pct, desc] of [[10, 'LED very dim'], [50, 'LED at half brightness'], [100, 'LED fully bright']]) {
      await fire(`Brightness ${pct}%`, [0x09, pct], desc);
      await sleep(7000);
    }

    // ── Test 2: Pause on / off (verified via STATUS query) ────────────────────
    step('');
    step('── Test 2: Pause on/off — verified via STATUS query after each ──────');
    for (let i = 0; i < 2; i++) {
      await fire('Pause ON', [0x06, 0x01], 'LED stops blinking (solid or off); tracking halted');
      await sleep(1000);
      const afterOn = await queryStatus('After Pause ON');
      if (afterOn[1] === 0x01) ok('STATUS confirms: device is now PAUSED');
      else fail(`STATUS says pause=${afterOn[1]} after Pause ON — expected 0x01`);
      await sleep(7000);

      await fire('Pause OFF', [0x06, 0x02], 'LED resumes blinking; tracking active');
      await sleep(1000);
      const afterOff = await queryStatus('After Pause OFF');
      if (afterOff[1] === 0x02) ok('STATUS confirms: device is now RUNNING');
      else fail(`STATUS says pause=${afterOff[1]} after Pause OFF — expected 0x02`);
      await sleep(7000);
    }

    // ── Test 3: Color formats ─────────────────────────────────────────────────
    step('');
    step('── Test 3: LED color — all 4 wire formats, observe LED ─────────────');
    step('Color commands have no readback. Watch the device.');

    const facet = this._controller.getCurrentFacet() || 1;
    step(`Using facet ${facet} (current active facet)`);

    step('');
    step('Format A — 16-bit per channel (SPEC §12: 0x11 facet RR RR GG GG BB BB):');
    await fire('Color RED   16bit', [0x11, facet, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00], 'LED should turn RED');
    await sleep(7000);
    await fire('Color GREEN 16bit', [0x11, facet, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00], 'LED should turn GREEN');
    await sleep(7000);
    await fire('Color BLUE  16bit', [0x11, facet, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF], 'LED should turn BLUE');
    await sleep(7000);

    step('');
    step('Format B — 8-bit per channel (0x11 facet RR GG BB):');
    await fire('Color RED   8bit', [0x11, facet, 0xFF, 0x00, 0x00], 'LED should turn RED');
    await sleep(7000);
    await fire('Color GREEN 8bit', [0x11, facet, 0x00, 0xFF, 0x00], 'LED should turn GREEN');
    await sleep(7000);
    await fire('Color BLUE  8bit', [0x11, facet, 0x00, 0x00, 0xFF], 'LED should turn BLUE');
    await sleep(7000);

    step('');
    step('Format C — RGB565 packed into 2 bytes (0x11 facet HH LL):');
    await fire('Color RED   rgb565', [0x11, facet, 0xF8, 0x00], 'LED should turn RED');
    await sleep(7000);
    await fire('Color GREEN rgb565', [0x11, facet, 0x07, 0xE0], 'LED should turn GREEN');
    await sleep(7000);
    await fire('Color BLUE  rgb565', [0x11, facet, 0x00, 0x1F], 'LED should turn BLUE');
    await sleep(7000);

    step('');
    step('Format D — percentage 0-100 in 16-bit (0x11 facet 0 R% 0 G% 0 B%):');
    await fire('Color RED   pct', [0x11, facet, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00], 'LED should turn RED');
    await sleep(7000);
    await fire('Color GREEN pct', [0x11, facet, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00], 'LED should turn GREEN');
    await sleep(7000);
    await fire('Color BLUE  pct', [0x11, facet, 0x00, 0x00, 0x00, 0x00, 0x00, 0x64], 'LED should turn BLUE');
    await sleep(7000);

    step('');
    step('╔══════════════════════════════════════════════════╗');
    step('║          BLE TEST SEQUENCE COMPLETE              ║');
    step('╚══════════════════════════════════════════════════╝');
    step('Pause/lock: check PASS/FAIL lines above.');
    step('Brightness/color: note what you observed on the device.');
  }

  async _logSessionInfo(peripheral) {
    const appVersion = this.homey.app.manifest.version;
    const peripheralUuid = this.getStore().peripheralUuid || peripheral.uuid || 'unknown';
    this.log(`[INFO] App version: ${appVersion} | Device UUID: ${peripheralUuid}`);
    try {
      const readStr = async (uuid) => {
        const buf = await peripheral.read('180a', uuid);
        return Buffer.from(buf).toString('utf8').replace(/\0/g, '').trim();
      };
      const model    = await readStr('2a24').catch(() => '?');
      const firmware = await readStr('2a26').catch(() => '?');
      const hardware = await readStr('2a27').catch(() => '?');
      this.log(`[INFO] Device info — model: ${model} | firmware: ${firmware} | hardware: ${hardware}`);
    } catch (err) {
      this.log('[INFO] Could not read device info service:', err.message);
    }
  }

  async _dumpAllCharacteristics(peripheral) {
    const services = await peripheral.discoverServices([]);
    for (const svc of services) {
      const chars = await svc.discoverCharacteristics([]);
      for (const char of chars) {
        try {
          const value = await char.read();
          this.log(`[DEBUG] ${svc.uuid}/${char.uuid}: ${Array.from(value).map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
        } catch (e) {
          this.log(`[DEBUG] ${svc.uuid}/${char.uuid}: (not readable)`);
        }
      }
    }
  }

  _scheduleColorUpdate() {
    if (this._colorUpdateTimer) clearTimeout(this._colorUpdateTimer);
    this._colorUpdateTimer = setTimeout(async () => {
      this._colorUpdateTimer = null;
      const currentFacet = this.getCapabilityValue('timeflip_facet') || 1;
      await this._applyColorToFacet(currentFacet);
    }, 200);
  }

  async _applyColorToFacet(facetNum) {
    if (!this._controller) return;
    try {
      const rgb = this.hsvToRgb(this._currentHue, this._currentSat, 1);
      this.log(`Re-applying color to facet ${facetNum}: H=${this._currentHue} S=${this._currentSat}`);
      await this._controller.setLedColor(facetNum, rgb.r, rgb.g, rgb.b, '16bit');
    } catch (err) {
      this.error('Failed to apply color to facet:', err.message);
    }
  }
}

module.exports = TimeFlipDevice;
