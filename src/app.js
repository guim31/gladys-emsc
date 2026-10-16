// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake Gladys)
// and returns the monitor, so index.js stays a few lines and the tests drive
// the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { CONFIG_ACTION, SCENE_ACTION, checkNow, readEarthquakes } from './actions.js';
import { normalizeConfig } from './config.js';
import { STATUS, render } from './messages.js';
import { Monitor } from './monitor.js';
import { Store } from './store.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'emsc-app' });

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, fetch, WebSocket, timers, now, timings
 */
export function registerHandlers(gladys, options = {}) {
  const monitor = new Monitor({
    gladys,
    store: options.store ?? new Store(),
    fetch: options.fetch,
    WebSocket: options.WebSocket,
    timers: options.timers ?? true,
    now: options.now,
    timings: options.timings,
    streamTimings: options.streamTimings,
  });

  // Resolved once the monitor has started; every handler waits for it, so a
  // request arriving during the start is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  // One start or resync at a time: the SDK says `connected` at every authentication.
  let starting = Promise.resolve();
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      await starting;
      if (!started) {
        throw new Error('The integration did not start, see its logs');
      }
      return fn(...args);
    };

  const onConnected = async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        // A reconnection (Gladys restarted): publish everything again.
        await monitor.resync(config);
        return;
      }
      await monitor.start(config);
      // Only now: a failed start is tried again at the next connection.
      started = true;
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, render(STATUS, 'initFailed')).catch(() => {});
      // The next status of the monitor must be sent, even if it equals its last one.
      monitor.statusMessage = undefined;
    } finally {
      resolveReady();
    }
  };
  gladys.on('connected', () => {
    starting = starting.then(onConnected);
    return starting;
  });

  gladys.onScanRequest(whenReady(() => monitor.publishDiscovered()));

  // The device is published with should_poll: false (pushed by the feed and
  // the monitor's own timer); this only serves a Gladys that would poll anyway.
  gladys.onPoll(whenReady((device) => monitor.poll(device)));

  gladys.onDeviceCreated(whenReady((device) => monitor.onDeviceCreated(device)));

  gladys.onConfigUpdated(whenReady((newConfig) => monitor.reconfigure(normalizeConfig(newConfig))));

  gladys.onAction(
    CONFIG_ACTION,
    whenReady(() => checkNow(monitor)),
  );
  gladys.onSceneAction(
    SCENE_ACTION,
    whenReady(() => readEarthquakes(monitor)),
  );

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(monitor, request)),
    );
  }

  return {
    monitor,
    ready,
    stop: () => monitor.stop(),
  };
}
