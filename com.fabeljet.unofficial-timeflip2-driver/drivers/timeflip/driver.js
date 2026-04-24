'use strict';

const Homey = require('homey');

class TimeFlipDriver extends Homey.Driver {
  async onInit() {
    this.log('TimeFlipDriver has been initialized');
  }

  async onPair(session) {
    session.setHandler('list_devices', async () => {
      const devices = [];
      
      const advertisements = await this.homey.ble.discover();
      
      for (const [id, adv] of Object.entries(advertisements || {})) {
        const localName = adv.localName || '';
        if (localName?.toLowerCase().includes('timeflip')) {
          devices.push({
            name: localName,
            data: { id },
          });
        }
      }
      
      return devices;
    });
  }
}

module.exports = TimeFlipDriver;
