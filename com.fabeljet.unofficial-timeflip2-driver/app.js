'use strict';

const Homey = require('homey');

class TimeFlipApp extends Homey.App {
  async onInit() {
    this.log('TimeFlipApp has been initialized');

    const facetChangedTrigger = this.homey.flow.getTriggerCard('facet_changed');
    const doubleTapTrigger = this.homey.flow.getTriggerCard('double_tap');

    this.on('trigger:facet_changed', ({ device, tokens }) => {
      facetChangedTrigger.trigger(tokens).catch(this.error);
    });

    this.on('trigger:double_tap', ({ device, tokens }) => {
      doubleTapTrigger.trigger(tokens).catch(this.error);
    });

    const facetIsCondition = this.homey.flow.getConditionCard('facet_is');
    facetIsCondition.registerRunListener(async (args, state) => {
      return state.device.getCapabilityValue('timeflip_facet') === parseInt(args.facet, 10);
    });

    const isPausedCondition = this.homey.flow.getConditionCard('is_paused');
    isPausedCondition.registerRunListener(async (args, state) => {
      return !state.device.getCapabilityValue('onoff');
    });

    const isLockedCondition = this.homey.flow.getConditionCard('is_locked');
    isLockedCondition.registerRunListener(async (args, state) => {
      return state.device.getCapabilityValue('locked');
    });

    const setPauseAction = this.homey.flow.getActionCard('set_pause');
    setPauseAction.registerRunListener(async (args, device) => {
      const controller = device._controller;
      if (controller) {
        await controller.setPause(args.value === 'on');
      }
    });

    const setLockAction = this.homey.flow.getActionCard('set_lock');
    setLockAction.registerRunListener(async (args, device) => {
      const controller = device._controller;
      if (controller) {
        await controller.setLock(args.value === 'on');
      }
    });

    const setAutoPauseAction = this.homey.flow.getActionCard('set_auto_pause');
    setAutoPauseAction.registerRunListener(async (args, device) => {
      const controller = device._controller;
      if (controller) {
        await controller.setAutoPause(args.minutes);
      }
    });

    const syncTimeAction = this.homey.flow.getActionCard('sync_time');
    syncTimeAction.registerRunListener(async (args, device) => {
      const controller = device._controller;
      if (controller) {
        await controller.syncTime();
      }
    });

    const setBrightnessAction = this.homey.flow.getActionCard('set_brightness');
    setBrightnessAction.registerRunListener(async (args, device) => {
      const controller = device._controller;
      if (controller) {
        await controller.setBrightness(args.brightness);
      }
    });

    const setLedColorAction = this.homey.flow.getActionCard('set_led_color');
    setLedColorAction.registerRunListener(async (args, device) => {
      const controller = device._controller;
      if (controller) {
        const colors = {
          red: [255, 0, 0],
          green: [0, 255, 0],
          blue: [0, 0, 255],
          yellow: [255, 255, 0],
          cyan: [0, 255, 255],
          magenta: [255, 0, 255],
          white: [255, 255, 255],
        };
        const rgb = colors[args.color] || [255, 255, 255];
        await controller.setLedColor(parseInt(args.facet), rgb[0], rgb[1], rgb[2]);
      }
    });

    const setBlinkIntervalAction = this.homey.flow.getActionCard('set_blink_interval');
    setBlinkIntervalAction.registerRunListener(async (args, device) => {
      const controller = device._controller;
      if (controller) {
        await controller.setBlinkInterval(args.interval);
      }
    });
  }
}

module.exports = TimeFlipApp;