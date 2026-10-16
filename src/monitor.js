// -----------------------------------------------------------------------------
// The monitor: listens to the EMSC real-time feed, keeps the earthquakes of
// the followed zone, publishes the states of the device, fires the scene
// triggers and serves the widget and the actions.
//
// Followed zone: the earthquakes within `radius` of the centre (the
// coordinates of the configuration, or the first located house of Gladys) and
// of magnitude `min_magnitude` at least; plus, when set, those within
// `far_radius` and of magnitude `far_min_magnitude` at least.
//
// Catch-up: the FDSN service gives the earthquakes of the zone over the last
// 7 days at the start, after the feed was lost (what happened meanwhile) and
// when the zone changes. It is read again at most every 5 minutes: the feed
// does the work, the service is not polled.
//
// Triggers: "new earthquake" for an earthquake entering the zone that is less
// than an hour old (an old one reported late is history, not news), "magnitude
// revised" when EMSC revises the magnitude of one by 0.5 or more. What is
// there at the very first start, or when the zone changes, fires nothing.
// What was seen is kept under /data, so a restart fires nothing either.
//
// States: `publishChangedStates` sends only what changed, plus a heartbeat every
// 12 hours; a timer ages the 24-hour values. The coordinates of the centre are
// never logged nor stored (only a hash, to notice a change of zone).
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import {
  MAX_DEPTH_KM,
  MAX_DISTANCE_KM,
  MAX_MAGNITUDE,
  MIN_DEPTH_KM,
  buildDevice,
  deviceIds,
} from './device.js';
import { Stream, fetchEvents, parseMessage } from './emsc.js';
import { distanceKm } from './geo.js';
import { STATUS, ZONE_NAMES, describe, formatFullDate, join, render } from './messages.js';

const logger = createLogger({ name: 'emsc' });

export const WIDGET_KEY = 'earthquakes';
export const TRIGGERS = { NEW: 'new_earthquake', REVISED: 'magnitude_revised' };
export const ZONES = ['near', 'far'];
// A revision of the magnitude this large fires the "magnitude revised" trigger.
export const REVISION_STEP = 0.5;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEFAULT_TIMINGS = {
  heartbeatMs: 12 * HOUR,
  // Ages the 24-hour values, retries a failed catch-up, reads the houses again.
  tickMs: 5 * MINUTE,
  // Earthquakes kept (widget, catch-up window).
  retentionMs: 7 * DAY,
  // An earthquake older than this when it enters the zone fires nothing.
  newsMaxAgeMs: HOUR,
  // Two catch-ups are this far apart at least.
  catchUpGapMs: 5 * MINUTE,
  // requestWidgetRefresh is rate-limited to one call every 10 s by the core.
  widgetRefreshMs: 10000,
  // The houses of Gladys are read again this often (no update event).
  housesMaxAgeMs: HOUR,
};

// Earthquakes kept at most, newest first.
export const MAX_KEPT = 200;
// Scene events fired at once at most (a catch-up after a long outage): the core
// takes 300 a minute, and a swarm is better summed up by the device.
export const MAX_EVENTS_PER_BATCH = 20;

const newestFirst = (a, b) => b.time - a.time;
const round1 = (value) => Math.round(value * 10) / 10;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK fake)
   * @param {object} options.store see src/store.js
   * @param {Function} [options.fetch] fetch
   * @param {Function} [options.WebSocket] WebSocket class
   * @param {boolean} [options.timers] false: no background timer (tests drive the ticks)
   * @param {Function} [options.now] clock in ms
   * @param {object} [options.timings] overrides of DEFAULT_TIMINGS
   * @param {object} [options.streamTimings] see DEFAULT_STREAM_TIMINGS
   */
  constructor({
    gladys,
    store,
    fetch: fetchImpl,
    WebSocket,
    timers = true,
    now,
    timings,
    streamTimings,
  }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = fetchImpl ?? ((...args) => fetch(...args));
    this.timers = timers;
    this.now = now ?? (() => Date.now());
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = null;
    this.data = emptyData();
    // The values of the zone are known: loaded for the same zone, or caught up.
    this.synced = false;
    this.seedNext = false;
    this.truncated = false;
    this.house = undefined;
    this.houseReadAt = -Infinity;
    this.centerValue = null;
    this.catching = null;
    this.needsCatchUp = false;
    this.lastCatchUpAt = -Infinity;
    this.lastUpdateAt = null;
    this.feedWasOpen = false;
    this.statusMessage = undefined;
    this.tickTimer = null;
    this.lastRefreshAt = -Infinity;
    this.refreshTimer = null;
    this.signature = null;
    this.stopped = false;
    // Keys of the failures already logged, so a repeated one is not logged again.
    this.failing = new Set();
    this.stream = new Stream({
      WebSocket,
      timings: streamTimings,
      onOpen: () => this.onFeedOpen(),
      onClose: (reason) => this.onFeedClose(reason),
      onMessage: (text) => this.onFeedMessage(text),
    });
  }

  /** Log a failure once (warn or error), then at debug until `recovered(key)`. */
  failed(key, level, message, err) {
    const details = err ? [message, err] : [message];
    if (this.failing.has(key)) {
      logger.debug(...details);
      return;
    }
    this.failing.add(key);
    logger[level](...details);
  }

  /** One line when a failure logged by `failed(key)` is over. */
  recovered(key, message) {
    if (this.failing.delete(key)) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    if (saved?.version === 1 && Array.isArray(saved.events)) {
      this.data = { ...emptyData(), ...saved };
    }
    await this.publishDiscovered();
    this.warnAboutConfig();
    await this.resolveZone();
    logger.info(
      `Started: earthquakes of M${config.near.minMagnitude} and more within ${config.near.radiusKm} km${config.far ? `, M${config.far.minMagnitude} and more within ${config.far.radiusKm} km` : ''}`,
    );
    this.schedule();
    this.stream.start();
    this.catchUp();
  }

  /** Reconnection to Gladys: it may have restarted, publish everything again. */
  async resync(config) {
    this.config = config;
    this.houseReadAt = -Infinity;
    await this.publishDiscovered();
    await this.resolveZone();
    this.statusMessage = undefined;
    await this.updateConnectionStatus();
    this.gladys.forgetPublishedStates?.();
    await this.publishStates();
    this.requestRefresh();
  }

  async reconfigure(config) {
    await this.catching;
    const languageChanged = config.language !== this.config?.language;
    this.config = config;
    this.houseReadAt = -Infinity;
    logger.info('Configuration saved');
    this.warnAboutConfig();
    if (languageChanged) {
      await this.publishDiscovered();
      // The texts of the features are in the language of the configuration.
      this.gladys.forgetPublishedStates?.();
    }
    const changed = await this.resolveZone();
    if (changed) {
      await this.catchUp();
    } else {
      await this.publishStates();
      await this.updateConnectionStatus();
    }
    this.requestRefresh();
  }

  async stop() {
    this.stopped = true;
    this.stream.stop();
    clearInterval(this.tickTimer);
    clearTimeout(this.refreshTimer);
    this.tickTimer = null;
    await this.catching?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    if (!this.timers || this.stopped) {
      return;
    }
    clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => this.tick(), this.timings.tickMs);
    this.tickTimer.unref?.();
  }

  warnAboutConfig() {
    if (this.config.invalidCenter) {
      logger.warn('The coordinates of the configuration are not valid: the house is used');
    }
    if (this.config.farIgnored) {
      logger.warn('Far zone ignored: its radius and magnitude must exceed those of the near zone');
    }
  }

  async publishDiscovered() {
    await this.gladys.publishDiscoveredDevices([buildDevice(this.gladys, this.config.language)]);
  }

  isCreated() {
    const id = deviceIds(this.gladys).device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  // --- Zone ----------------------------------------------------------------------

  /** The centre of the zone: the configured coordinates, else the first located house. */
  async center() {
    if (this.config.center) {
      return this.config.center;
    }
    if (this.now() - this.houseReadAt >= this.timings.housesMaxAgeMs) {
      try {
        const houses = await this.gladys.getHouses();
        this.house =
          houses.find(
            (house) => Number.isFinite(house.latitude) && Number.isFinite(house.longitude),
          ) ?? null;
        this.houseReadAt = this.now();
        this.recovered('houses', 'The houses of Gladys are readable again');
      } catch (err) {
        this.failed('houses', 'warn', `Cannot read the houses of Gladys: ${err.message}`);
      }
    }
    return this.house ? { latitude: this.house.latitude, longitude: this.house.longitude } : null;
  }

  /**
   * Reads the centre; a new zone (centre or settings) starts from scratch: the
   * earthquakes it holds already are not news. Returns true if the zone changed.
   */
  async resolveZone() {
    this.centerValue = await this.center();
    if (!this.centerValue) {
      return false;
    }
    const { near, far } = this.config;
    const key = createHash('sha256')
      .update(JSON.stringify([this.centerValue.latitude, this.centerValue.longitude, near, far]))
      .digest('hex')
      .slice(0, 16);
    if (key === this.data.zone) {
      this.synced ||= this.data.seeded === true;
      return false;
    }
    logger.debug('New zone: the earthquakes it holds already are taken as known');
    this.data = { ...emptyData(), zone: key };
    this.synced = false;
    this.seedNext = true;
    this.needsCatchUp = true;
    this.signature = null;
    return true;
  }

  /** The zone of an earthquake ('near', 'far' or null) and its distance. */
  locate(event) {
    if (!this.centerValue) {
      return { zone: null, distance: null };
    }
    const distance = distanceKm(
      this.centerValue.latitude,
      this.centerValue.longitude,
      event.latitude,
      event.longitude,
    );
    const { near, far } = this.config;
    if (distance <= near.radiusKm && event.magnitude >= near.minMagnitude) {
      return { zone: 'near', distance };
    }
    if (far && distance <= far.radiusKm && event.magnitude >= far.minMagnitude) {
      return { zone: 'far', distance };
    }
    return { zone: null, distance };
  }

  // --- Feed ----------------------------------------------------------------------

  onFeedOpen() {
    if (this.feedWasOpen) {
      this.recovered('feed', 'EMSC real-time feed back');
      // What happened while the feed was lost.
      this.requestCatchUp();
    } else {
      // The catch-up of the start covers the time before.
      this.feedWasOpen = true;
      this.failing.delete('feed');
      logger.info('Connected to the EMSC real-time feed');
    }
    this.updateConnectionStatus();
  }

  onFeedClose(reason) {
    this.failed('feed', 'warn', `EMSC real-time feed lost (${reason}): reconnecting`);
    this.updateConnectionStatus();
  }

  onFeedMessage(text) {
    const message = parseMessage(text);
    if (!message) {
      logger.debug('Feed: message not understood');
      return;
    }
    this.lastUpdateAt = this.now();
    if (message.action === 'delete') {
      this.remove(message.id);
      this.afterChange();
      return;
    }
    if (!message.event) {
      return;
    }
    const changes = this.ingest(message.event, { seed: false });
    if (changes === null) {
      return;
    }
    this.afterChange();
    this.fireAll(changes);
  }

  // --- Earthquakes -------------------------------------------------------------------

  /**
   * Takes one earthquake (from the feed or the catch-up) into the zone, or out
   * of it. Returns the scene events to fire, or null when nothing changed.
   */
  ingest(event, { seed }) {
    const now = this.now();
    const known = this.data.events.find((entry) => entry.id === event.id);
    const { zone, distance } = this.locate(event);
    if (!event.earthquake || zone === null || event.time < now - this.timings.retentionMs) {
      if (known) {
        // Revised out of the zone (magnitude, position) or reclassified.
        logger.debug(`${event.id} leaves the zone`);
        this.remove(event.id);
        return [];
      }
      return null;
    }
    const entry = { ...event, distanceKm: round1(distance), zone };
    delete entry.earthquake;
    const changes = [];
    if (known) {
      Object.assign(known, entry);
      this.data.events.sort(newestFirst);
      const step = Math.abs(entry.magnitude - known.previousMagnitude);
      if (!seed && step >= REVISION_STEP - 1e-9 && event.time >= now - DAY) {
        changes.push({ key: TRIGGERS.REVISED, event: known, previous: known.previousMagnitude });
      }
      // The reference of the next revision is the magnitude announced last.
      if (step >= REVISION_STEP - 1e-9) {
        known.previousMagnitude = entry.magnitude;
      }
    } else {
      const added = { ...entry, previousMagnitude: entry.magnitude };
      this.data.events.push(added);
      this.data.events.sort(newestFirst);
      this.data.events.length = Math.min(this.data.events.length, MAX_KEPT);
      if (!seed && event.time >= now - this.timings.newsMaxAgeMs) {
        changes.push({ key: TRIGGERS.NEW, event: added });
      } else {
        logger.debug(`${event.id} added without trigger`);
      }
    }
    this.updateLast();
    return changes;
  }

  remove(id) {
    const before = this.data.events.length;
    this.data.events = this.data.events.filter((entry) => entry.id !== id);
    if (this.data.events.length !== before) {
      this.updateLast();
    }
  }

  /**
   * The latest earthquake of the zone. Kept once older than the retention (the
   * device still shows it), dropped when revised out of the zone.
   */
  updateLast() {
    const newest = this.data.events[0];
    if (newest) {
      this.data.last = { ...newest };
      return;
    }
    const aged = this.data.last && this.data.last.time < this.now() - this.timings.retentionMs;
    if (!aged) {
      this.data.last = null;
    }
  }

  prune() {
    const limit = this.now() - this.timings.retentionMs;
    this.data.events = this.data.events.filter((entry) => entry.time >= limit);
  }

  /** After the earthquakes changed: save, publish, nudge the widget. */
  afterChange() {
    this.store.save(this.data);
    this.publishStates();
    this.refreshIfChanged();
  }

  refreshIfChanged() {
    const signature = this.data.events.map((entry) => `${entry.id}:${entry.magnitude}`).join(',');
    if (signature !== this.signature) {
      this.signature = signature;
      this.requestRefresh();
    }
  }

  // --- Catch-up ----------------------------------------------------------------------

  /** A catch-up now, or at the next tick if the last one is too recent. */
  requestCatchUp() {
    this.needsCatchUp = true;
    if (this.now() - this.lastCatchUpAt >= this.timings.catchUpGapMs) {
      this.catchUp();
    }
  }

  catchUp() {
    if (this.catching || this.stopped) {
      return this.catching;
    }
    this.catching = this.runCatchUp()
      .catch((err) => this.failed('catchup', 'error', 'Catch-up failed', err))
      .finally(() => {
        this.catching = null;
      });
    return this.catching;
  }

  async runCatchUp() {
    if (!this.centerValue) {
      await this.resolveZone();
    }
    if (!this.centerValue) {
      await this.updateConnectionStatus();
      return;
    }
    this.needsCatchUp = false;
    this.lastCatchUpAt = this.now();
    const start = this.now() - this.timings.retentionMs;
    const zones = [this.config.near, this.config.far].filter(Boolean);
    const found = new Map();
    let truncated = false;
    try {
      for (const zone of zones) {
        const result = await fetchEvents(this.fetch, {
          center: this.centerValue,
          radiusKm: zone.radiusKm,
          minMagnitude: zone.minMagnitude,
          start,
        });
        truncated ||= result.truncated;
        for (const event of result.events) {
          found.set(event.id, event);
        }
      }
      this.recovered('fdsn', 'The EMSC event service answers again');
    } catch (err) {
      this.needsCatchUp = true;
      this.failed('fdsn', 'warn', `EMSC event service unreachable: ${err.message}`);
      await this.updateConnectionStatus();
      return;
    }
    this.truncated = truncated;
    const seed = this.seedNext;
    this.seedNext = false;
    const changes = [];
    for (const event of [...found.values()].sort((a, b) => a.time - b.time)) {
      changes.push(...(this.ingest(event, { seed }) ?? []));
    }
    // Gone from EMSC (deleted, or revised out of the zone while the feed was lost).
    if (!truncated) {
      for (const entry of [...this.data.events]) {
        if (!found.has(entry.id) && entry.time >= start) {
          this.remove(entry.id);
        }
      }
    }
    this.prune();
    this.updateLast();
    logger.debug(`Catch-up: ${found.size} earthquake(s) in the zone over 7 days`);
    this.data.seeded = true;
    this.synced = true;
    this.lastUpdateAt = this.now();
    this.store.save(this.data);
    await this.publishStates();
    await this.updateConnectionStatus();
    this.refreshIfChanged();
    await this.fireAll(changes);
  }

  // --- Ticks ---------------------------------------------------------------------

  async tick() {
    if (this.stopped) {
      return;
    }
    if (!this.config.center) {
      const changed = await this.resolveZone();
      if (changed) {
        await this.catchUp();
        return;
      }
    }
    if (this.needsCatchUp) {
      await this.catchUp();
    }
    const before = this.data.events.length;
    this.prune();
    if (this.data.events.length !== before) {
      this.store.save(this.data);
    }
    await this.publishStates();
    this.refreshIfChanged();
  }

  // --- Scene triggers ----------------------------------------------------------------

  async fireAll(changes) {
    for (const [index, change] of changes.entries()) {
      if (index >= MAX_EVENTS_PER_BATCH) {
        logger.debug(`${changes.length - index} more scene event(s) not sent`);
        break;
      }
      await this.fire(change);
    }
  }

  async fire({ key, event, previous }) {
    logger.debug(
      key === TRIGGERS.NEW
        ? `New earthquake in the zone: ${describe(event, 'en')}`
        : `Magnitude revised from ${previous} to ${event.magnitude}: ${event.region}`,
    );
    try {
      await this.gladys.publishSceneEvent(key, this.eventData(event, previous));
      this.recovered('scene', 'Scene triggers work again');
    } catch (err) {
      this.failed('scene', 'warn', `Firing the scene trigger failed: ${err.message}`);
    }
  }

  /** The flat data of a scene event (fields, then variables of the manifest). */
  eventData(event, previous) {
    const language = this.config.language;
    const data = {
      zone: event.zone,
      magnitude: event.magnitude,
      magnitude_type: event.magnitudeType,
      distance_km: Math.round(event.distanceKm),
      depth_km: event.depthKm === null ? null : round1(event.depthKm),
      region: event.region,
      time: formatFullDate(event.time, language),
      zone_name: ZONE_NAMES[language][event.zone],
      summary: describe(event, language),
      url: event.url,
    };
    if (previous !== undefined) {
      data.previous_magnitude = previous;
    }
    return data;
  }

  // --- States ------------------------------------------------------------------------

  /** The earthquakes of the last 24 hours, newest first. */
  day() {
    const since = this.now() - DAY;
    return this.data.events.filter((entry) => entry.time >= since);
  }

  statesOf() {
    if (!this.synced) {
      return [];
    }
    const ids = deviceIds(this.gladys);
    const language = this.config.language;
    const day = this.day();
    const states = [
      { device_feature_external_id: ids.count, state: day.length },
      {
        device_feature_external_id: ids.max,
        state: Math.max(0, ...day.map((entry) => entry.magnitude)),
      },
    ];
    const last = this.data.last;
    if (last) {
      states.push(
        {
          device_feature_external_id: ids.magnitude,
          state: clamp(last.magnitude, 0, MAX_MAGNITUDE),
        },
        {
          device_feature_external_id: ids.distance,
          state: clamp(round1(last.distanceKm), 0, MAX_DISTANCE_KM),
        },
        { device_feature_external_id: ids.time, text: formatFullDate(last.time, language) },
      );
      if (last.depthKm !== null) {
        states.push({
          device_feature_external_id: ids.depth,
          state: clamp(round1(last.depthKm), MIN_DEPTH_KM, MAX_DEPTH_KM),
        });
      }
      if (last.region) {
        states.push({ device_feature_external_id: ids.region, text: last.region });
      }
    }
    return states;
  }

  async publishStates() {
    if (!this.isCreated()) {
      return;
    }
    const states = this.statesOf();
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.recovered('publish', 'Publishing the states works again');
    } catch (err) {
      // Sent again at the next change or tick (the SDK forgets what Gladys refused).
      this.failed('publish', 'warn', `Publishing the states failed: ${err.message}`);
    }
  }

  async updateConnectionStatus() {
    if (this.stopped || !this.config) {
      return;
    }
    const parts = [];
    if (this.failing.has('feed')) {
      parts.push(render(STATUS, 'feedDown'));
    }
    if (!this.centerValue) {
      parts.push(render(STATUS, 'noCenter'));
    } else if (this.config.invalidCenter) {
      parts.push(render(STATUS, 'invalidCenter'));
    }
    if (this.config.farIgnored) {
      parts.push(render(STATUS, 'farIgnored'));
    }
    if (this.truncated) {
      parts.push(render(STATUS, 'truncated'));
    }
    const message = parts.length > 0 ? join(...parts) : undefined;
    const connected = this.stream.open && this.centerValue !== null;
    const key = JSON.stringify([connected, message]);
    if (key === this.statusMessage) {
      return;
    }
    this.statusMessage = key;
    await this.gladys.setConnectionStatus(connected, message).catch(() => {});
  }

  // --- Gladys events -----------------------------------------------------------------

  async onDeviceCreated(device) {
    if (device?.external_id !== deviceIds(this.gladys).device) {
      return;
    }
    if (!this.synced) {
      await this.catchUp();
    }
    // The SDK forgot the states of the device: everything is published again.
    await this.publishStates();
    this.requestRefresh();
  }

  /** onPoll fallback: should_poll is false, but a Gladys polling anyway gets an answer. */
  async poll(device) {
    if (device?.external_id === deviceIds(this.gladys).device) {
      await this.publishStates();
    }
  }

  /** The earthquakes of the zone, caught up first if needed. */
  async fresh() {
    if (!this.synced || this.needsCatchUp) {
      await this.catchUp();
    } else {
      await this.catching;
    }
    return { day: this.day(), events: this.data.events, last: this.data.last, ok: this.synced };
  }

  // --- Widget -------------------------------------------------------------------------

  requestRefresh() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const wait = this.lastRefreshAt + this.timings.widgetRefreshMs - now;
    if (wait <= 0) {
      this.lastRefreshAt = now;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } else if (this.timers && !this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.requestRefresh();
      }, wait);
      this.refreshTimer.unref?.();
    }
  }
}

function emptyData() {
  return { version: 1, zone: null, seeded: false, events: [], last: null };
}
