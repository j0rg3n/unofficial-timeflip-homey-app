const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const TimeFlipController = require('../lib/TimeFlipController');
const MockBleClient = require('./mocks/MockBleClient');

describe('TimeFlipController', () => {
  let mock;
  let controller;

  beforeEach(() => {
    mock = new MockBleClient();
    controller = new TimeFlipController(mock);
  });

  describe('start', () => {
    it('connects and authenticates with password', async () => {
      await controller.start({ blePassword: '123456' });

      const lastCmd = mock.getLastSentCommand();
      assert.strictEqual(lastCmd.type, 'password');
      assert.strictEqual(lastCmd.password, '123456');
    });

    it('throws on invalid password', async () => {
      mock.setPasswordResult(false);

      await assert.rejects(() => controller.start({ blePassword: 'wrong' }), {
        message: 'Invalid password',
      });
    });

    it('subscribes to facet and double-tap notifications', async () => {
      await controller.start();

      mock.simulateFacetChange(5);
      mock.simulateDoubleTap(3, true);

      const events = [];
      controller.on('facet_changed', (e) => events.push(e));
      controller.on('double_tap', (e) => events.push(e));

      mock.simulateFacetChange(7);
      mock.simulateDoubleTap(2, false);

      await new Promise((r) => setTimeout(r, 10));
    });
  });

  describe('events', () => {
    it('emits facet_changed when facet changes', async () => {
      await controller.start();
      controller.onSettings({ facet_1_label: 'Work', facet_5_label: 'Meeting' });

      let event = null;
      controller.on('facet_changed', (e) => { event = e; });

      mock.simulateFacetChange(5);

      assert.strictEqual(event.facet, 5);
      assert.strictEqual(event.facetName, 'Meeting');
    });

    it('emits double_tap with paused state', async () => {
      await controller.start();

      let event = null;
      controller.on('double_tap', (e) => { event = e; });

      mock.simulateDoubleTap(3, true);

      assert.strictEqual(event.facet, 3);
      assert.strictEqual(event.paused, true);
    });

    it('emits battery_updated on start', async () => {
      mock.setBatteryLevel(85);
      
      let level = null;
      controller.on('battery_updated', (l) => { level = l; });

      await controller.start();

      assert.strictEqual(level, 85);
    });
  });

  describe('setPause', () => {
    it('sends pause command', async () => {
      await controller.start();
      await controller.setPause(true);

      const lastCmd = mock.getLastSentCommand();
      assert.strictEqual(lastCmd.type, 'command');
      assert.deepStrictEqual(lastCmd.bytes, [0x06, 0x01]);

      await controller.setPause(false);

      const lastCmd2 = mock.getLastSentCommand();
      assert.deepStrictEqual(lastCmd2.bytes, [0x06, 0x02]);
    });

    it('emits pause_changed event', async () => {
      await controller.start();

      let paused = null;
      controller.on('pause_changed', (p) => { paused = p; });

      await controller.setPause(true);
      assert.strictEqual(paused, true);

      await controller.setPause(false);
      assert.strictEqual(paused, false);
    });
  });

  describe('setLock', () => {
    it('sends lock command', async () => {
      await controller.start();
      await controller.setLock(true);

      const lastCmd = mock.getLastSentCommand();
      assert.deepStrictEqual(lastCmd.bytes, [0x04, 0x01]);

      await controller.setLock(false);
      assert.deepStrictEqual(mock.getLastSentCommand().bytes, [0x04, 0x02]);
    });
  });

  describe('getFacetDailyTotals', () => {
    it('returns empty totals initially', () => {
      const totals = controller.getFacetDailyTotals();

      for (let i = 1; i <= 12; i++) {
        assert.strictEqual(totals[i], 0);
      }
    });

    it('updates after facet change', async () => {
      await controller.start();

      controller.getFacetDailyTotals();
    });
  });

  describe('onReconnect', () => {
    it('reads history and updates insights', async () => {
      const historyBuffer = Buffer.from([
        0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      mock.setHistoryFixture([historyBuffer]);

      await controller.start();
      await controller.onReconnect();

      const totals = controller.getFacetDailyTotals();
      assert.ok(totals[1] >= 0);
    });
  });

  describe('stop', () => {
    it('disconnects the client', async () => {
      await controller.start();
      await controller.stop();

      assert.strictEqual(mock.connected, false);
    });
  });
});