'use strict';

const Homey = require('homey');

class TimeFlipApp extends Homey.App {
  async onInit() {
    this.log('TimeFlipApp has been initialized');

    const facetChangedTrigger = this.homey.flow.getTriggerCard('facet_changed');
    const doubleTapTrigger = this.homey.flow.getTriggerCard('double_tap');

    this.on('trigger:facet_changed', ({ device, tokens }) => {
      facetChangedTrigger.trigger(device, tokens).catch(this.error);
    });

    this.on('trigger:double_tap', ({ device, tokens }) => {
      doubleTapTrigger.trigger(device, tokens).catch(this.error);
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
  }
}

module.exports = TimeFlipApp;
