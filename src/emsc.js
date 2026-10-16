// -----------------------------------------------------------------------------
// EMSC-CSEM clients, both without account or key:
//   - the real-time feed, a WebSocket that sends one JSON message per
//     earthquake created or revised anywhere in the world
//     ({ action: "create" | "update", data: <GeoJSON feature> });
//   - the FDSN event service, read only to catch up: at the start, and after
//     the feed was lost (what happened meanwhile).
// Both give the same GeoJSON feature, parsed by `parseFeature`.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'emsc-feed' });

export const WS_URL = 'wss://www.seismicportal.eu/standing_order/websocket';
export const FDSN_URL = 'https://www.seismicportal.eu/fdsnws/event/1/query';
export const EMSC_SITE = 'https://www.emsc-csem.org';

// One degree of great circle, in km (FDSN takes its radius in degrees).
const KM_PER_DEGREE = 111.195;
// More would be a very active area or a very wide zone: the newest are kept.
export const FDSN_LIMIT = 500;
const TIMEOUT_MS = 30000;

// Event types of EMSC that are not natural earthquakes: quarry blasts and
// explosions. Seen in October 2026: ke (known earthquake), se (suspected),
// ue (unknown event); every code but these is kept.
const NOT_EARTHQUAKE = /^(qb|[ks][xn])$/;

const finite = (value) =>
  value === null || value === undefined || value === ''
    ? null
    : Number.isFinite(Number(value))
      ? Number(value)
      : null;

/** The page of an event: the EMSC one (felt reports) when known, else the Seismic Portal. */
export function eventUrl(unid, sourceId) {
  return sourceId
    ? `${EMSC_SITE}/Earthquake_information/earthquake.php?id=${encodeURIComponent(sourceId)}`
    : `https://www.seismicportal.eu/eventdetails.html?unid=${encodeURIComponent(unid)}`;
}

/** "SOUTHERN GREECE" → "Southern Greece" (EMSC writes the Flinn-Engdahl regions in capitals). */
export function regionName(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s,\-/(.])(\p{L})/gu, (all, before, letter) => before + letter.toUpperCase());
}

/**
 * A GeoJSON feature of EMSC as a plain event, or null when it is not usable
 * (no id, no position, no magnitude, or not an earthquake).
 */
export function parseFeature(feature) {
  const p = feature?.properties;
  if (!p || typeof p !== 'object') {
    return null;
  }
  const id = String(p.unid ?? feature.id ?? '').trim();
  const latitude = finite(p.lat ?? feature.geometry?.coordinates?.[1]);
  const longitude = finite(p.lon ?? feature.geometry?.coordinates?.[0]);
  const magnitude = finite(p.mag);
  const time = Date.parse(p.time);
  if (!id || latitude === null || longitude === null || magnitude === null || Number.isNaN(time)) {
    return null;
  }
  const type = String(p.evtype ?? '').toLowerCase();
  const depth = finite(p.depth);
  return {
    id,
    time,
    latitude,
    longitude,
    depthKm: depth,
    magnitude: Math.round(magnitude * 10) / 10,
    magnitudeType: String(p.magtype ?? '').trim(),
    region: regionName(p.flynn_region),
    authority: String(p.auth ?? '').trim(),
    earthquake: !NOT_EARTHQUAKE.test(type),
    url: eventUrl(id, String(p.source_id ?? '').trim()),
  };
}

/** One message of the real-time feed: `{ action, event }`, or null. */
export function parseMessage(text) {
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return null;
  }
  const action = String(message?.action ?? '').toLowerCase();
  if (!action) {
    return null;
  }
  return { action, event: parseFeature(message.data), id: message.data?.properties?.unid };
}

const iso = (time) => new Date(time).toISOString().slice(0, 19);

/**
 * The earthquakes of a zone since `start` (FDSN, newest first).
 * @param {Function} fetchImpl fetch
 * @param {{ center: { latitude, longitude }, radiusKm: number, minMagnitude: number, start: number }} query
 */
export async function fetchEvents(fetchImpl, { center, radiusKm, minMagnitude, start }) {
  const url = new URL(FDSN_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('lat', center.latitude.toFixed(4));
  url.searchParams.set('lon', center.longitude.toFixed(4));
  // A little wider than the zone: the exact distance is measured afterwards.
  url.searchParams.set('maxradius', ((radiusKm + 10) / KM_PER_DEGREE).toFixed(3));
  url.searchParams.set('minmag', String(minMagnitude));
  url.searchParams.set('start', iso(start));
  url.searchParams.set('orderby', 'time');
  url.searchParams.set('limit', String(FDSN_LIMIT));
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`seismicportal.eu: ${err.cause?.code ?? err.message}`, { cause: err });
  }
  // FDSN answers 204 without body when nothing matches.
  if (response.status === 204) {
    return { events: [], truncated: false };
  }
  if (response.status !== 200) {
    throw new Error(`seismicportal.eu: HTTP ${response.status}`);
  }
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    throw new Error('seismicportal.eu: not JSON');
  }
  const features = Array.isArray(body?.features) ? body.features : [];
  return {
    events: features.map(parseFeature).filter(Boolean),
    truncated: features.length >= FDSN_LIMIT,
  };
}

export const DEFAULT_STREAM_TIMINGS = {
  // Reconnection delay, doubled at each failure up to the maximum.
  retryMinMs: 5000,
  retryMaxMs: 5 * 60 * 1000,
  // The feed sends several earthquakes an hour from the whole world: this
  // long without a message, the connection is taken as dead and reopened.
  silenceMs: 2 * 60 * 60 * 1000,
};

/**
 * The real-time feed, reopened whenever it closes. Callbacks: `onOpen()`,
 * `onClose(reason)` (once per outage, the very first failed attempt included,
 * not once per attempt), `onMessage(text)`.
 */
export class Stream {
  constructor({
    WebSocket: WebSocketImpl = globalThis.WebSocket,
    url = WS_URL,
    onOpen,
    onClose,
    onMessage,
    timings,
  }) {
    this.WebSocket = WebSocketImpl;
    this.url = url;
    this.onOpen = onOpen ?? (() => {});
    this.onClose = onClose ?? (() => {});
    this.onMessage = onMessage ?? (() => {});
    this.timings = { ...DEFAULT_STREAM_TIMINGS, ...timings };
    this.socket = null;
    this.open = false;
    // The loss was reported: one onClose per outage, not per failed attempt.
    this.lost = false;
    this.stopped = true;
    this.retryMs = this.timings.retryMinMs;
    this.retryTimer = null;
    this.silenceTimer = null;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.silenceTimer);
    const socket = this.socket;
    this.socket = null;
    this.open = false;
    try {
      socket?.close();
    } catch {
      // Already closed.
    }
  }

  connect() {
    if (this.stopped) {
      return;
    }
    let socket;
    try {
      socket = new this.WebSocket(this.url);
    } catch (err) {
      this.closed(null, err.message);
      return;
    }
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (socket !== this.socket) {
        return;
      }
      this.open = true;
      this.lost = false;
      this.retryMs = this.timings.retryMinMs;
      this.watch();
      this.onOpen();
    });
    socket.addEventListener('message', (event) => {
      if (socket !== this.socket) {
        return;
      }
      this.watch();
      this.onMessage(typeof event.data === 'string' ? event.data : String(event.data));
    });
    // An error is always followed by a close: the close does the work.
    socket.addEventListener('error', () => {});
    socket.addEventListener('close', (event) => {
      this.closed(socket, event?.code ? `closed (${event.code})` : 'closed');
    });
  }

  /** Re-arms the silence watchdog. */
  watch() {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      logger.debug('No message for too long: reopening the feed');
      const socket = this.socket;
      this.closed(socket, 'silent');
      try {
        socket?.close();
      } catch {
        // Already closed.
      }
    }, this.timings.silenceMs);
    this.silenceTimer.unref?.();
  }

  closed(socket, reason) {
    if (socket !== this.socket || this.stopped) {
      return;
    }
    this.socket = null;
    clearTimeout(this.silenceTimer);
    this.open = false;
    if (!this.lost) {
      this.lost = true;
      this.onClose(reason);
    }
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, this.timings.retryMaxMs);
    logger.debug(`Feed ${reason}: reopening in ${Math.round(delay / 1000)} s`);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
    this.retryTimer.unref?.();
  }
}
