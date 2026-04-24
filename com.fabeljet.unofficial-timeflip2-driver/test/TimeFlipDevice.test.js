'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const MockBleClient = require('./mocks/MockBleClient');
const TimeFlipController = require('../lib/TimeFlipController');

describe('TimeFlipDevice integration', () => {
  let mockBle;
  let controller;

  beforeEach(() => {
    mockBle = new MockBleClient();
    controller = new TimeFlipController(mockBle);
  });

  describe('initialization', () => {
    it('starts controller and authenticates', async () => {
      await controller.start({ blePassword: '000000', doubleTapSensitivity: 'medium' });
      const lastCmd = mockBle.getLastSentCommand();
      assert.strictEqual(lastCmd.type, 'password');
    });

    it('throws on invalid password', async () => {
      mockBle.setPasswordResult(false);
      await assert.rejects(() => controller.start({ blePassword: 'wrong' }), {
        message: 'Invalid password',
      });
    });
  });

  describe('controller events', () => {
    it('facet change updates controller state', async () => {
      await controller.start({ blePassword: '000000' });

      mockBle.simulateFacetChange(5);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const facet = controller.getCurrentFacet();
      assert.strictEqual(facet, 5);
    });

    it('double tap updates pause state', async () => {
      await controller.start({ blePassword: '000000' });

      mockBle.simulateDoubleTap(3, true);

      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.strictEqual(controller.isPaused(), true);
    });

    it('insights updates on facet change', async () => {
      await controller.start({ blePassword: '000000' });

      mockBle.simulateFacetChange(1);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const totals = controller.getFacetDailyTotals();
      assert.ok(totals[1] >= 0);
    });
  });

  describe('settings', () => {
    it('updates settings with facet labels', async () => {
      const newSettings = {
        blePassword: '000000',
        facet_1_label: 'Work',
        facet_5_label: 'Meeting',
      };

      await controller.start({ blePassword: '000000' });
      await controller.onSettings(newSettings, {});

      await new Promise((resolve) => setTimeout(resolve, 250));
      mockBle.simulateFacetChange(5);
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.strictEqual(controller.getCurrentFacet(), 5);
    });
  });

  describe('reconnect', () => {
    it('reads history on reconnect', async () => {
      const historyBuffer = Buffer.from([
        0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      mockBle.setHistoryFixture([historyBuffer]);

      await controller.start({ blePassword: '000000' });
      await controller.onReconnect();

      const totals = controller.getFacetDailyTotals();
      assert.ok(totals[1] >= 0);
    });
  });

  describe('pause/lock', () => {
    it('setPause sends command', async () => {
      await controller.start({ blePassword: '000000' });

      await controller.setPause(true);
      const lastCmd = mockBle.getLastSentCommand();
      assert.deepStrictEqual(lastCmd.bytes, [0x06, 0x01]);

      await controller.setPause(false);
      const lastCmd2 = mockBle.getLastSentCommand();
      assert.deepStrictEqual(lastCmd2.bytes, [0x06, 0x02]);
    });

    it('setLock sends command', async () => {
      await controller.start({ blePassword: '000000' });

      await controller.setLock(true);
      const lastCmd = mockBle.getLastSentCommand();
      assert.deepStrictEqual(lastCmd.bytes, [0x04, 0x01]);
    });
  });
});
