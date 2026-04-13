'use strict';

class InsightsAccumulator {
  constructor() {
    this._dailyTotals = {};
    this._activeFacet = null;
    this._activeFacetStart = null;
    this._dayStart = Date.now();

    for (let i = 1; i <= 12; i++) {
      this._dailyTotals[i] = 0;
    }
  }

  ingestHistory(parsedEvents) {
    for (let i = 0; i < parsedEvents.length; i++) {
      const event = parsedEvents[i];
      if (event.isPause) continue;
      if (event.facet >= 1 && event.facet <= 12) {
        this._dailyTotals[event.facet] += event.durationSeconds;
      }
    }
  }

  setActiveFacet(facetId, sinceTimestamp) {
    this._activeFacet = facetId;
    this._activeFacetStart = sinceTimestamp * 1000;
  }

  getDailyTotals() {
    const totals = {};
    const keys = Object.keys(this._dailyTotals);
    for (let i = 0; i < keys.length; i++) {
      totals[keys[i]] = this._dailyTotals[keys[i]];
    }

    if (this._activeFacet && this._activeFacetStart) {
      const elapsed = Math.floor((Date.now() - this._activeFacetStart) / 1000);
      totals[this._activeFacet] += elapsed;
    }

    const result = {};
    for (let i = 1; i <= 12; i++) {
      result[i] = Math.floor((totals[i] || 0) / 60);
    }
    return result;
  }

  resetDay() {
    for (let i = 1; i <= 12; i++) {
      this._dailyTotals[i] = 0;
    }
    this._dayStart = Date.now();
  }
}

module.exports = InsightsAccumulator;
