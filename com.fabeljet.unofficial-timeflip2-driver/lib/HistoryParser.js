'use strict';

const HistoryParser = {
  parse(buffers) {
    const events = [];
    for (const buffer of buffers) {
      if (buffer.length < 13) continue;
      if (buffer[0] === 0xFF && buffer[1] === 0xFF && buffer[2] === 0xFF && buffer[3] === 0xFF) {
        continue;
      }

      const eventNumber = buffer.readUInt32LE(0);
      const side = buffer[4];
      const isPause = side > 127;
      const facet = isPause ? side - 128 : side;
      const timestamp = buffer.readUInt32LE(5);
      const durationSeconds = buffer.readUInt32LE(9);

      events.push({
        eventNumber,
        facet,
        timestamp,
        durationSeconds,
        isPause,
      });
    }
    return events;
  },

  sumByFacet(events, sinceTimestamp) {
    if (typeof sinceTimestamp === 'undefined') sinceTimestamp = 0;
    const totals = {};
    for (let i = 1; i <= 12; i++) {
      totals[i] = 0;
    }

    for (let j = 0; j < events.length; j++) {
      const event = events[j];
      if (event.timestamp >= sinceTimestamp && !event.isPause) {
        if (totals[event.facet] !== undefined) {
          totals[event.facet] += event.durationSeconds;
        }
      }
    }
    return totals;
  },
};

module.exports = HistoryParser;
