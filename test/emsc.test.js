// -----------------------------------------------------------------------------
// The EMSC clients on real answers: the parsing of the recorded features and
// feed messages, the FDSN query and its errors, and the real-time feed that
// reopens itself.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FDSN_LIMIT,
  Stream,
  eventUrl,
  fetchEvents,
  parseFeature,
  parseMessage,
  regionName,
} from '../src/emsc.js';
import { AEGEAN_SEA, createApi, createFeed, fixture, settle } from './helpers/world.js';

const recorded = fixture('emsc/fdsn-aegean-2026-10-16.json');
const messages = fixture('emsc/websocket-2026-10-16.json');

test('a recorded feature becomes a plain event', () => {
  const event = parseFeature(recorded.features.find((f) => f.properties.unid === AEGEAN_SEA));
  assert.deepEqual(event, {
    id: AEGEAN_SEA,
    time: Date.parse('2026-10-16T04:31:12.24Z'),
    latitude: 38.8866,
    longitude: 25.2635,
    depthKm: 15,
    magnitude: 2.7,
    magnitudeType: 'ml',
    region: 'Aegean Sea',
    authority: 'EMSC',
    earthquake: true,
    url: 'https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=2075555',
  });
  assert.equal(recorded.features.map(parseFeature).filter(Boolean).length, 13);
});

test('region names, event pages, unusable features', () => {
  assert.equal(regionName('DODECANESE ISLANDS, GREECE'), 'Dodecanese Islands, Greece');
  assert.equal(regionName('POTOSI, BOLIVIA'), 'Potosi, Bolivia');
  assert.equal(regionName('NEAR EAST COAST OF HONSHU'), 'Near East Coast Of Honshu');
  assert.equal(regionName(undefined), '');
  assert.equal(
    eventUrl('20261016_0000147', ''),
    'https://www.seismicportal.eu/eventdetails.html?unid=20261016_0000147',
  );
  const base = recorded.features[0];
  const without = (key) => {
    const copy = structuredClone(base);
    delete copy.properties[key];
    return copy;
  };
  assert.equal(parseFeature(without('mag')), null);
  assert.equal(parseFeature(without('time')), null);
  assert.equal(parseFeature(null), null);
  const blast = structuredClone(base);
  blast.properties.evtype = 'qb';
  assert.equal(parseFeature(blast).earthquake, false);
  const unknown = structuredClone(base);
  unknown.properties.evtype = 'ue';
  assert.equal(parseFeature(unknown).earthquake, true);
});

test('the recorded feed messages: a creation and a revision', () => {
  const [created, updated] = messages.map((message) => parseMessage(JSON.stringify(message)));
  assert.equal(created.action, 'create');
  assert.equal(created.event.region, 'Panama');
  assert.equal(created.event.magnitude, 3.5);
  assert.equal(updated.action, 'update');
  assert.equal(updated.event.region, 'Potosi, Bolivia');
  assert.equal(updated.event.depthKm, 221.7);
  assert.equal(parseMessage('not json'), null);
  assert.equal(parseMessage('{}'), null);
});

test('the FDSN query: zone in degrees, magnitude, start, newest first', async () => {
  const api = createApi();
  const { events, truncated } = await fetchEvents(api.fetch, {
    center: { latitude: 37.9838, longitude: 23.7275 },
    radiusKm: 200,
    minMagnitude: 2.5,
    start: Date.parse('2026-10-09T14:00:00Z'),
  });
  const url = api.requests[0];
  assert.equal(url.origin + url.pathname, 'https://www.seismicportal.eu/fdsnws/event/1/query');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.searchParams.get('maxradius'), '1.889');
  assert.equal(url.searchParams.get('minmag'), '2.5');
  assert.equal(url.searchParams.get('start'), '2026-10-09T14:00:00');
  assert.equal(url.searchParams.get('limit'), String(FDSN_LIMIT));
  assert.equal(truncated, false);
  assert.equal(events[0].id, AEGEAN_SEA);
  // The query is a little wider than the zone: the exact distance comes after.
  assert.equal(events.length, 6);
});

test('FDSN: 204 is an empty answer, the errors say what failed', async () => {
  const api = createApi();
  const query = {
    center: { latitude: 48.85, longitude: 2.35 },
    radiusKm: 25,
    minMagnitude: 5,
    start: 0,
  };
  assert.deepEqual(await fetchEvents(api.fetch, query), { events: [], truncated: false });
  api.down = 503;
  await assert.rejects(fetchEvents(api.fetch, query), /seismicportal\.eu: HTTP 503/);
  api.down = 'network';
  await assert.rejects(fetchEvents(api.fetch, query), /seismicportal\.eu: fetch failed/);
  const garbage = async () => ({ status: 200, text: async () => '<html>' });
  await assert.rejects(fetchEvents(garbage, query), /not JSON/);
});

test('the feed reopens itself, and reports one loss per outage', async () => {
  const feed = createFeed();
  const calls = [];
  const stream = new Stream({
    WebSocket: feed.WebSocket,
    onOpen: () => calls.push('open'),
    onClose: (reason) => calls.push(`close ${reason}`),
    onMessage: (text) => calls.push(`message ${text}`),
    timings: { retryMinMs: 0, retryMaxMs: 0 },
  });
  stream.start();
  await settle();
  assert.equal(stream.open, true);
  feed.raw('{"a":1}');
  feed.up = false;
  feed.drop();
  await settle();
  await settle();
  // Several failed attempts, one loss reported.
  assert.ok(feed.sockets.length >= 3);
  feed.up = true;
  await settle();
  await settle();
  stream.stop();
  assert.deepEqual(calls, ['open', 'message {"a":1}', 'close closed (1006)', 'open']);
});

test('the first failure is reported too, and a silent feed is reopened', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const feed = createFeed();
  feed.up = false;
  const calls = [];
  const stream = new Stream({
    WebSocket: feed.WebSocket,
    onOpen: () => calls.push('open'),
    onClose: (reason) => calls.push(`close ${reason}`),
    timings: { retryMinMs: 1000, retryMaxMs: 4000, silenceMs: 60000 },
  });
  stream.start();
  await Promise.resolve();
  assert.deepEqual(calls, ['close closed (1006)']);
  // Backoff: 1 s, then 2 s.
  t.mock.timers.tick(1000);
  await Promise.resolve();
  assert.equal(feed.sockets.length, 2);
  t.mock.timers.tick(1999);
  assert.equal(feed.sockets.length, 2);
  feed.up = true;
  t.mock.timers.tick(1);
  await Promise.resolve();
  assert.deepEqual(calls, ['close closed (1006)', 'open']);
  // One minute without message: the socket is closed and opened again.
  t.mock.timers.tick(60000);
  await Promise.resolve();
  assert.deepEqual(calls, ['close closed (1006)', 'open', 'close silent']);
  t.mock.timers.tick(1000);
  await Promise.resolve();
  assert.equal(calls.at(-1), 'open');
  stream.stop();
});
