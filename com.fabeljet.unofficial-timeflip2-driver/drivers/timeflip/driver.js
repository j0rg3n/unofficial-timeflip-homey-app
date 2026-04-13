'use strict';

const Homey = require('homey');

class TimeFlipDriver extends Homey.Driver {
  async onInit() {
    this.log('TimeFlipDriver has been initialized');
  }

  async onPairListDevices() {
    const devices = [];

    try {
      const peripherals = await this.homey.ble.find();

      for (const peripheral of Object.values(peripherals)) {
        const { advertisement } = peripheral;
        const localName = advertisement.localName || '';

        if (localName.includes('TimeFlip')) {
          devices.push({
            name: peripheral.localName || 'TimeFlip 2',
            data: {
              id: peripheral.id,
            },
          });
        }
      }
    } catch (err) {
      this.log('Error scanning for devices:', err.message);
    }

    return devices;
  }
}

module.exports = TimeFlipDriver;
