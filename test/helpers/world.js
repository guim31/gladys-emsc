// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake EMSC (the FDSN event
// service serving the recorded earthquakes of test/fixtures, filtered the way
// the real service does, and a fake real-time WebSocket), a manual clock, a
// temporary /data, and the integration wired on top through registerHandlers.
// Nothing touches the network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { distanceKm } from '../../src/geo.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Paris';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

// The earthquakes were recorded on 16/10/2026 at 14:00 UTC.
export const START = Date.parse('2026-10-16T14:00:00Z');

// A house in Athens (public coordinates of the city centre).
export const HOUSE = {
  id: 'house-1',
  name: 'Spiti',
  selector: 'spiti',
  latitude: 37.9838,
  longitude: 23.7275,
};

// Recorded earthquakes (unid), with their distance to the house.
export const AEGEAN_SEA = '20261016_0000045'; // M2.7, 167 km, 16/10 04:31 UTC
export const SOUTHERN_GREECE = '20261014_0000095'; // M3.2, 168 km, depth 61 km
export const GREECE_NEAR = '20261014_0000237'; // M2.5, 83 km
export const DODECANESE = '20261014_0000409'; // M3.2, 311 km, depth 137 km

const KM_PER_DEGREE = 111.195;

/**
 * Fake EMSC. `api.down`: 'network' (connection refused), a status (503) or false.
 */
export function createApi() {
  const recorded = fixture('emsc/fdsn-aegean-2026-10-16.json');
  const api = {
    features: structuredClone(recorded.features),
    down: false,
    requests: [],
    // A promise: the answers wait for it (a request in flight).
    gate: null,

    feature(id) {
      return api.features.find((feature) => feature.properties.unid === id);
    },

    /** A new earthquake, copied from a recorded one, with a new id. */
    add(fromId, { id, time, magnitude, latitude, longitude } = {}) {
      const feature = structuredClone(api.feature(fromId));
      const p = feature.properties;
      p.unid = id;
      feature.id = id;
      p.source_id = String(Number(p.source_id) + 1000);
      if (time !== undefined) {
        p.time = new Date(time).toISOString();
      }
      if (magnitude !== undefined) {
        p.mag = magnitude;
      }
      if (latitude !== undefined) {
        p.lat = latitude;
        p.lon = longitude;
        feature.geometry.coordinates = [longitude, latitude, -p.depth];
      }
      api.features.unshift(feature);
      return feature;
    },

    remove(id) {
      api.features = api.features.filter((feature) => feature.properties.unid !== id);
    },

    query(url) {
      const params = url.searchParams;
      const lat = Number(params.get('lat'));
      const lon = Number(params.get('lon'));
      const maxKm = Number(params.get('maxradius')) * KM_PER_DEGREE;
      const minmag = Number(params.get('minmag'));
      const start = Date.parse(`${params.get('start')}Z`);
      const limit = Number(params.get('limit'));
      return api.features
        .filter((feature) => {
          const p = feature.properties;
          return (
            p.mag >= minmag &&
            Date.parse(p.time) >= start &&
            distanceKm(lat, lon, p.lat, p.lon) <= maxKm
          );
        })
        .sort((a, b) => Date.parse(b.properties.time) - Date.parse(a.properties.time))
        .slice(0, limit);
    },

    async fetch(input) {
      const url = new URL(input);
      api.requests.push(url);
      await api.gate;
      if (api.down === 'network') {
        throw new TypeError('fetch failed');
      }
      if (api.down) {
        return { status: api.down, text: async () => 'Service Unavailable' };
      }
      if (!url.pathname.endsWith('/fdsnws/event/1/query')) {
        return { status: 404, text: async () => 'Not Found' };
      }
      const features = api.query(url);
      if (features.length === 0) {
        // The real service answers 204 with an empty body.
        return { status: 204, text: async () => '' };
      }
      const body = { type: 'FeatureCollection', metadata: { count: features.length }, features };
      return { status: 200, text: async () => JSON.stringify(body) };
    },
  };
  return api;
}

/**
 * Fake real-time feed: a WebSocket class and the server side driving it.
 * `server.up = false` refuses the next connections.
 */
export function createFeed() {
  const server = {
    up: true,
    sockets: [],
    get socket() {
      return server.sockets.at(-1);
    },
    /** Sends one message, as the real feed does, to the open socket. */
    send(action, feature) {
      server.socket.emit('message', { data: JSON.stringify({ action, data: feature }) });
    },
    raw(text) {
      server.socket.emit('message', { data: text });
    },
    /** The connection is lost. */
    drop(code = 1006) {
      const socket = server.socket;
      socket.readyState = 3;
      socket.emit('close', { code });
    },
  };

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.readyState = 0;
      server.sockets.push(this);
      const up = server.up;
      queueMicrotask(() => {
        if (up) {
          this.readyState = 1;
          this.emit('open', {});
        } else {
          this.readyState = 3;
          this.emit('error', {});
          this.emit('close', { code: 1006 });
        }
      });
    }

    addEventListener(type, listener) {
      (this.listeners[type] ??= []).push(listener);
    }

    emit(type, event) {
      for (const listener of this.listeners[type] ?? []) {
        listener(event);
      }
    }

    close() {
      if (this.readyState !== 3) {
        this.readyState = 3;
        queueMicrotask(() => this.emit('close', { code: 1000 }));
      }
    }
  }

  server.WebSocket = FakeWebSocket;
  return server;
}

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/** Lets the microtasks and the zero-delay timers run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {Array} [options.houses] houses of Gladys
 * @param {object} [options.api] from createApi
 * @param {object} [options.feed] from createFeed
 * @param {boolean} [options.connect]
 */
export async function createWorld({
  config = {},
  devices = [],
  houses = [HOUSE],
  api = createApi(),
  feed = createFeed(),
  connect = true,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-emsc-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices, houses });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, {
    store,
    fetch: api.fetch,
    WebSocket: feed.WebSocket,
    timers: false,
    now: clock.now,
    // Reconnections at once: the tests drive the feed.
    streamTimings: { retryMinMs: 0, retryMaxMs: 0 },
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.monitor.catching;
    await settle();
  }
  return { gladys, fake: gladys.fake, app, monitor: app.monitor, api, feed, clock, store, dataDir };
}

/** Create the device in Gladys, as the user would. */
export async function create(world) {
  const [device] = world.fake.discoveredDevices;
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** Ids of the earthquakes of the zone, newest first. */
export const zoneIds = (world) => world.monitor.data.events.map((event) => event.id);

/** One message of the feed, then everything it starts. */
export async function live(world, action, feature) {
  world.feed.send(action, feature);
  await settle();
  await world.monitor.catching;
}

/** One tick of the monitor's timer, `minutes` later. */
export async function tick(world, minutes = 5) {
  world.clock.advance(minutes * 60 * 1000);
  await world.monitor.tick();
  await settle();
}

/**
 * Capture the integration's log lines at `level` and above (LOG_LEVEL is read
 * at every call). Returns the lines as `{ level, text }`.
 */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
