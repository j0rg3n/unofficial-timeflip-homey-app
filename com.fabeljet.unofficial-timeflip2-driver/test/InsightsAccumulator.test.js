const { describe, it } = require('node:test');
const assert = require('node:assert');
const InsightsAccumulator = require('../lib/InsightsAccumulator');

describe('InsightsAccumulator', () => {
  describe('ingestHistory', () => {
    it('adds duration to correct facet', () => {
      const acc = new InsightsAccumulator();
      const events = [
        { facet: 1, durationSeconds: 600, isPause: false },
        { facet: 5, durationSeconds: 300, isPause: false },
        { facet: 1, durationSeconds: 120, isPause: true },
      ];

      acc.ingestHistory(events);

      const totals = acc.getDailyTotals();
      assert.strictEqual(totals[1], 10); // 600 sec = 10 min
      assert.strictEqual(totals[5], 5);  // 300 sec = 5 min
    });

    it('ignores pause events', () => {
      const acc = new InsightsAccumulator();
      const events = [
        { facet: 1, durationSeconds: 600, isPause: true },
      ];

      acc.ingestHistory(events);

      const totals = acc.getDailyTotals();
      assert.strictEqual(totals[1], 0);
    });
  });

  describe('setActiveFacet', () => {
    it('tracks active facet with start time', () => {
      const acc = new InsightsAccumulator();
      const nowSec = Math.floor(Date.now() / 1000);
      acc.setActiveFacet(3, nowSec);

      const totals = acc.getDailyTotals();
      assert.strictEqual(totals[3], 0);
    });

    it('includes extrapolated time for active facet', () => {
      const acc = new InsightsAccumulator();
      const pastSec = Math.floor(Date.now() / 1000) - 120;
      acc.setActiveFacet(7, pastSec);

      const totals = acc.getDailyTotals();
      assert.ok(totals[7] >= 2);
    });
  });

  describe('getDailyTotals', () => {
    it('returns minutes for all 12 facets', () => {
      const acc = new InsightsAccumulator();
      const totals = acc.getDailyTotals();

      assert.strictEqual(Object.keys(totals).length, 12);
      for (let i = 1; i <= 12; i++) {
        assert.strictEqual(typeof totals[i], 'number');
      }
    });
  });

  describe('resetDay', () => {
    it('clears all totals', () => {
      const acc = new InsightsAccumulator();
      acc.ingestHistory([{ facet: 1, durationSeconds: 600, isPause: false }]);

      acc.resetDay();

      const totals = acc.getDailyTotals();
      assert.strictEqual(totals[1], 0);
    });
  });
});