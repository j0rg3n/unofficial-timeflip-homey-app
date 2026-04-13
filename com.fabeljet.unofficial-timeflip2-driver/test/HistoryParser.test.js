const { describe, it } = require('node:test');
const assert = require('node:assert');
const HistoryParser = require('../lib/HistoryParser');

describe('HistoryParser', () => {
  describe('parse', () => {
    it('parses single valid history block', () => {
      const buffer = Buffer.from([
        0x01, 0x00, 0x00, 0x00, // eventNumber = 1
        0x05, // facet = 5
        0x00, 0x10, 0x1F, 0x66, // timestamp = 1713000000 (little-endian)
        0x2A, 0x00, 0x00, 0x00, // duration = 42 seconds (little-endian)
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      const result = HistoryParser.parse([buffer]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].eventNumber, 1);
      assert.strictEqual(result[0].facet, 5);
      assert.strictEqual(result[0].timestamp, 0x661F1000);
      assert.strictEqual(result[0].durationSeconds, 42);
      assert.strictEqual(result[0].isPause, false);
    });

    it('parses pause event (facet > 127)', () => {
      const buffer = Buffer.from([
        0x02, 0x00, 0x00, 0x00, // eventNumber = 2
        0x85, // 133 = 5 + 128 = pause on facet 5
        0x00, 0x10, 0x1F, 0x67,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      const result = HistoryParser.parse([buffer]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].facet, 5);
      assert.strictEqual(result[0].isPause, true);
    });

    it('skips end sentinel', () => {
      const buffers = [
        Buffer.from([0x01, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      ];
      const result = HistoryParser.parse(buffers);

      assert.strictEqual(result.length, 1);
    });

    it('skips buffers shorter than 13 bytes', () => {
      const buffer = Buffer.from([0x01, 0x00, 0x00, 0x00]);
      const result = HistoryParser.parse([buffer]);

      assert.strictEqual(result.length, 0);
    });
  });

  describe('sumByFacet', () => {
    it('sums duration by facet', () => {
      const events = [
        {
          facet: 1, timestamp: 1000, durationSeconds: 60, isPause: false,
        },
        {
          facet: 2, timestamp: 1000, durationSeconds: 120, isPause: false,
        },
        {
          facet: 1, timestamp: 1000, durationSeconds: 30, isPause: false,
        },
        {
          facet: 1, timestamp: 1000, durationSeconds: 10, isPause: true,
        },
      ];
      const result = HistoryParser.sumByFacet(events);

      assert.strictEqual(result[1], 90);
      assert.strictEqual(result[2], 120);
    });

    it('filters by sinceTimestamp', () => {
      const events = [
        {
          facet: 1, timestamp: 500, durationSeconds: 100, isPause: false,
        },
        {
          facet: 1, timestamp: 1500, durationSeconds: 200, isPause: false,
        },
      ];
      const result = HistoryParser.sumByFacet(events, 1000);

      assert.strictEqual(result[1], 200);
    });

    it('returns zero for all facets when empty', () => {
      const result = HistoryParser.sumByFacet([]);

      for (let i = 1; i <= 12; i++) {
        assert.strictEqual(result[i], 0);
      }
    });
  });
});
