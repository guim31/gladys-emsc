// -----------------------------------------------------------------------------
// The monitor on the recorded EMSC earthquakes: the followed zone, the states
// of the device, the scene triggers (and when they must stay silent), the
// feed lost and back, the timer of the container, and the persistence under
// /data.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRIGGERS } from '../src/monitor.js';
import {
  AEGEAN_SEA,
  DODECANESE,
  GREECE_NEAR,
  HOUSE,
  SOUTHERN_GREECE,
  create,
  createApi,
  createFeed,
  createWorld,
  featureId,
  fixture,
  live,
  settle,
  tick,
  zoneIds,
} from './helpers/world.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

async function world(t, config = {}, options = {}) {
  const w = await createWorld({ config, ...options });
  t.after(() => w.app.stop());
  return w;
}

const keys = (w) => w.fake.sceneEvents.map((event) => event.key);

test('the zone at the start: 200 km and M2.5 around the house, newest first, no trigger', async (t) => {
  const w = await world(t);
  assert.deepEqual(zoneIds(w), [
    AEGEAN_SEA,
    GREECE_NEAR,
    SOUTHERN_GREECE,
    '20261014_0000086',
    '20261014_0000089',
    '20261013_0000038',
  ]);
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(w.fake.connectionStatus.connected, true);
  const wide = await world(t, { radius: '300', min_magnitude: '3' });
  assert.deepEqual(zoneIds(wide), [SOUTHERN_GREECE]);
  // 311 km away: out of a 300 km zone even though the query is a little wider.
  assert.ok(!zoneIds(wide).includes(DODECANESE));
});

test('the states of the device, once it is created', async (t) => {
  const w = await world(t, { language: 'en' });
  assert.deepEqual(w.fake.states, [], 'nothing published before the device exists');
  const device = await create(w);
  const state = (key) => w.fake.lastState(featureId(device, key));
  assert.equal(state('count_24h'), 1);
  assert.equal(state('max_magnitude_24h'), 2.7);
  assert.equal(state('last_magnitude'), 2.7);
  assert.equal(state('last_distance'), 167.3);
  assert.equal(state('last_depth'), 15);
  assert.equal(state('last_region'), 'Aegean Sea');
  // 04:31 UTC in Paris time (the TZ of the tests).
  assert.equal(state('last_time'), '16/10/2026, 06:31:12');
  assert.ok(w.fake.widgetRefreshes.includes('earthquakes'));
});

test('a new earthquake of the zone fires "new earthquake" with its variables', async (t) => {
  const w = await world(t);
  const device = await create(w);
  const feature = w.api.add(GREECE_NEAR, { id: 'live-1', time: w.clock.now() - 3 * MINUTE });
  await live(w, 'create', feature);
  assert.deepEqual(w.fake.sceneEvents, [
    {
      key: TRIGGERS.NEW,
      data: {
        zone: 'near',
        magnitude: 2.5,
        magnitude_type: 'ml',
        distance_km: 83,
        depth_km: 11.3,
        region: 'Greece',
        time: '16/10/2026 15:57:00',
        zone_name: 'Zone proche',
        summary: 'M2,5 Greece, à 83 km, 16/10 15:57',
        url: `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${feature.properties.source_id}`,
      },
    },
  ]);
  assert.equal(zoneIds(w)[0], 'live-1');
  assert.equal(w.fake.lastState(featureId(device, 'count_24h')), 2);
  assert.equal(w.fake.lastState(featureId(device, 'last_distance')), 83.1);
  // The same message again (EMSC sends some twice): nothing more.
  await live(w, 'create', feature);
  assert.equal(w.fake.sceneEvents.length, 1);
});

test('what stays silent: far away, too weak, too old, not an earthquake', async (t) => {
  const w = await world(t);
  await create(w);
  // The real messages recorded from the feed: Panama and Bolivia.
  for (const message of fixture('emsc/websocket-2026-10-16.json')) {
    await live(w, message.action, message.data);
  }
  const weak = w.api.add(GREECE_NEAR, { id: 'weak', time: w.clock.now(), magnitude: 2.4 });
  await live(w, 'create', weak);
  const blast = w.api.add(GREECE_NEAR, { id: 'blast', time: w.clock.now() });
  blast.properties.evtype = 'qb';
  await live(w, 'create', blast);
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(zoneIds(w).length, 6);
  // Two hours old when EMSC reports it: in the zone, but not news.
  const late = w.api.add(GREECE_NEAR, { id: 'late', time: w.clock.now() - 2 * HOUR });
  await live(w, 'create', late);
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.ok(zoneIds(w).includes('late'));
});

test('magnitude revisions: 0.5 or more fires, a smaller one does not, out of the zone leaves', async (t) => {
  const w = await world(t);
  const device = await create(w);
  const feature = w.api.add(GREECE_NEAR, { id: 'rev', time: w.clock.now() - MINUTE });
  await live(w, 'create', feature);
  feature.properties.mag = 2.8;
  await live(w, 'update', feature);
  assert.deepEqual(keys(w), [TRIGGERS.NEW]);
  feature.properties.mag = 3.1;
  await live(w, 'update', feature);
  assert.deepEqual(keys(w), [TRIGGERS.NEW, TRIGGERS.REVISED]);
  const revised = w.fake.sceneEvents[1].data;
  assert.equal(revised.magnitude, 3.1);
  assert.equal(revised.previous_magnitude, 2.5);
  assert.equal(w.fake.lastState(featureId(device, 'last_magnitude')), 3.1);
  // Revised below the minimum: out of the zone, the previous one is the latest again.
  feature.properties.mag = 2.2;
  await live(w, 'update', feature);
  assert.ok(!zoneIds(w).includes('rev'));
  assert.equal(w.fake.lastState(featureId(device, 'last_region')), 'Aegean Sea');
  assert.equal(keys(w).length, 2);
});

test('the far zone: strong earthquakes farther away, with their zone', async (t) => {
  const w = await world(t, { far_radius: '1000', far_min_magnitude: '4.5' });
  // Izmir, about 330 km from Athens.
  const strong = w.api.add(GREECE_NEAR, {
    id: 'izmir',
    time: w.clock.now(),
    magnitude: 4.6,
    latitude: 38.42,
    longitude: 27.14,
  });
  await live(w, 'create', strong);
  const weak = w.api.add(GREECE_NEAR, {
    id: 'izmir-small',
    time: w.clock.now(),
    magnitude: 4.4,
    latitude: 38.42,
    longitude: 27.14,
  });
  await live(w, 'create', weak);
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => [event.data.zone, event.data.distance_km]),
    [['far', 302]],
  );
});

test('the feed lost and back: status, then a catch-up of what happened meanwhile', async (t) => {
  const w = await world(t);
  await create(w);
  w.feed.up = false;
  w.feed.drop();
  await settle();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /flux temps réel/);
  // Meanwhile: a new earthquake, and one EMSC deleted.
  w.clock.advance(10 * MINUTE);
  w.api.add(SOUTHERN_GREECE, { id: 'missed', time: w.clock.now() - 5 * MINUTE });
  w.api.remove(GREECE_NEAR);
  const before = w.api.requests.length;
  w.feed.up = true;
  await settle();
  await settle();
  await w.monitor.catching;
  assert.equal(w.api.requests.length, before + 1);
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.connectionStatus.message, undefined);
  assert.deepEqual(keys(w), [TRIGGERS.NEW]);
  assert.equal(w.fake.sceneEvents[0].data.region, 'Southern Greece');
  assert.ok(!zoneIds(w).includes(GREECE_NEAR));
});

test('two outages within 5 minutes: the second catch-up waits for the tick', async (t) => {
  const w = await world(t);
  w.feed.drop();
  await settle();
  await w.monitor.catching;
  const after = w.api.requests.length;
  w.clock.advance(MINUTE);
  w.feed.drop();
  await settle();
  await w.monitor.catching;
  assert.equal(w.api.requests.length, after, 'not read again so soon');
  await tick(w);
  await w.monitor.catching;
  assert.equal(w.api.requests.length, after + 1);
});

test('a restart fires nothing for what was seen, but fires for what is new', async (t) => {
  const api = createApi();
  const first = await createWorld({ api });
  const recent = api.add(GREECE_NEAR, { id: 'seen', time: first.clock.now() - MINUTE });
  await live(first, 'create', recent);
  assert.deepEqual(keys(first), [TRIGGERS.NEW]);
  await first.app.stop();

  first.clock.advance(5 * MINUTE);
  api.add(GREECE_NEAR, { id: 'while-down', time: first.clock.now() - 2 * MINUTE });
  const second = await createWorld({ api, clock: first.clock, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.deepEqual(
    second.fake.sceneEvents.map((event) => event.data.summary),
    ['M2,5 Greece, à 83 km, 16/10 16:03'],
  );
  assert.equal(zoneIds(second).length, 8);
  // The centre is not in /data, only a hash of the zone.
  const saved = readFileSync(join(first.dataDir, 'emsc.json'), 'utf8');
  assert.doesNotMatch(saved, new RegExp(`${HOUSE.latitude}|${HOUSE.longitude}`));
});

test('a new zone starts from scratch, without trigger', async (t) => {
  const w = await world(t);
  await create(w);
  w.api.add(GREECE_NEAR, { id: 'fresh', time: w.clock.now() - MINUTE, magnitude: 2.1 });
  await w.fake.configUpdated({ min_magnitude: '2' });
  await w.monitor.catching;
  assert.ok(zoneIds(w).includes('fresh'));
  assert.deepEqual(w.fake.sceneEvents, []);
  // Coordinates replace the house: Paris, nothing around.
  await w.fake.configUpdated({ latitude: '48,8566', longitude: '2,3522' });
  await w.monitor.catching;
  assert.deepEqual(zoneIds(w), []);
});

test('the timer ages the 24-hour values; the latest earthquake stays', async (t) => {
  const w = await world(t);
  const device = await create(w);
  await tick(w, 24 * 60);
  assert.equal(w.fake.lastState(featureId(device, 'count_24h')), 0);
  assert.equal(w.fake.lastState(featureId(device, 'max_magnitude_24h')), 0);
  assert.equal(w.fake.lastState(featureId(device, 'last_magnitude')), 2.7);
  // Past the 7 days kept: the list is empty, the latest is still shown.
  await tick(w, 7 * 24 * 60);
  assert.deepEqual(zoneIds(w), []);
  assert.equal(w.monitor.data.last.id, AEGEAN_SEA);
});

test('the event service down: said once, tried again at the tick', async (t) => {
  const api = createApi();
  api.down = 503;
  const w = await world(t, {}, { api });
  assert.equal(w.monitor.synced, false);
  await create(w);
  assert.deepEqual(w.fake.states, [], 'no false zero before the first catch-up');
  api.down = false;
  await tick(w);
  await w.monitor.catching;
  assert.equal(w.monitor.synced, true);
  assert.equal(zoneIds(w).length, 6);
});

test('no centre: the status says so, nothing is followed', async (t) => {
  const w = await world(t, {}, { houses: [{ ...HOUSE, latitude: null, longitude: null }] });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /No centre/);
  assert.deepEqual(zoneIds(w), []);
  const feature = w.api.add(GREECE_NEAR, { id: 'x', time: w.clock.now() });
  await live(w, 'create', feature);
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('a reconnection to Gladys publishes everything again', async (t) => {
  const feed = createFeed();
  const w = await world(t, {}, { feed });
  const device = await create(w);
  const count = w.fake.states.length;
  await w.gladys.connect();
  await settle();
  assert.ok(w.fake.states.length >= count + 7);
  assert.equal(w.fake.lastState(featureId(device, 'count_24h')), 1);
});
