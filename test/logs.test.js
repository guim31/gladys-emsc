// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle
// (the start, the feed connected, lost and back, a user action), never one
// line per earthquake or per message of the feed; a failure that repeats is
// logged once, plus one line when it is over. Never the coordinates of the
// centre: the location of the home is the sensitive data here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GREECE_NEAR,
  HOUSE,
  captureLogs,
  create,
  createApi,
  createWorld,
  fixture,
  live,
  settle,
  tick,
} from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

async function world(t, config = {}, options = {}) {
  const w = await createWorld({ config, ...options });
  t.after(() => w.app.stop());
  return w;
}

test('the start is two info lines: the zone, then the feed', async (t) => {
  const lines = captureLogs(t, 'info');
  await world(t, { far_radius: '2000', far_min_magnitude: '5' });
  assert.deepEqual(lines.map(strip), [
    '[INFO] [emsc] Started: earthquakes of M2.5 and more within 200 km, M5 and more within 2000 km',
    '[INFO] [emsc] Connected to the EMSC real-time feed',
  ]);
});

test('earthquakes, feed messages and ticks write nothing at info', async (t) => {
  const w = await world(t);
  await create(w);
  const lines = captureLogs(t, 'info');
  for (const message of fixture('emsc/websocket-2026-10-16.json')) {
    await live(w, message.action, message.data);
  }
  const feature = w.api.add(GREECE_NEAR, { id: 'quiet', time: w.clock.now() });
  await live(w, 'create', feature);
  for (let i = 0; i < 4; i += 1) {
    await tick(w);
  }
  assert.equal(w.fake.sceneEvents.length, 1);
  assert.deepEqual(lines, []);
});

test('LOG_LEVEL=debug shows the earthquakes, never the coordinates of the centre', async (t) => {
  const lines = captureLogs(t, 'debug');
  const w = await world(t);
  const feature = w.api.add(GREECE_NEAR, { id: 'dbg', time: w.clock.now() });
  await live(w, 'create', feature);
  await world(t, { latitude: '43.6045', longitude: '1.444' });
  assert.ok(lines.some((line) => /Catch-up: 6 earthquake\(s\)/.test(line.text)));
  assert.ok(lines.some((line) => /New earthquake in the zone: M2.5 Greece/.test(line.text)));
  const all = lines.map((line) => line.text).join('\n');
  for (const value of [HOUSE.latitude, HOUSE.longitude, 43.6045, 1.444]) {
    assert.doesNotMatch(all, new RegExp(String(value).replace('.', '\\.')));
  }
});

test('the feed down at every attempt: one warning, then one line when it is back', async (t) => {
  const w = await world(t);
  const lines = captureLogs(t, 'info');
  w.feed.up = false;
  w.feed.drop();
  await settle();
  await settle();
  w.feed.up = true;
  await settle();
  await w.monitor.catching;
  assert.deepEqual(lines.map(strip), [
    '[WARN] [emsc] EMSC real-time feed lost (closed (1006)): reconnecting',
    '[INFO] [emsc] EMSC real-time feed back',
  ]);
});

test('the event service down at every tick: one warning, then one line at recovery', async (t) => {
  const api = createApi();
  const w = await world(t, {}, { api });
  const lines = captureLogs(t, 'info');
  api.down = 503;
  await w.fake.configUpdated({ radius: '100' });
  for (let i = 0; i < 3; i += 1) {
    await tick(w);
  }
  api.down = false;
  await tick(w);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [emsc] Configuration saved',
    '[WARN] [emsc] EMSC event service unreachable: seismicportal.eu: HTTP 503',
    '[INFO] [emsc] The EMSC event service answers again',
  ]);
});

test('states refused: one warning, then one line at recovery', async (t) => {
  const w = await world(t);
  await create(w);
  const lines = captureLogs(t, 'info');
  const publish = t.mock.method(w.gladys, 'publishChangedStates', async () => {
    throw new Error('Gladys unreachable');
  });
  for (let i = 0; i < 3; i += 1) {
    await tick(w);
  }
  assert.ok(publish.mock.callCount() >= 3);
  assert.deepEqual(lines.map(strip), [
    '[WARN] [emsc] Publishing the states failed: Gladys unreachable',
  ]);
  publish.mock.restore();
  await tick(w);
  assert.match(lines.at(-1).text, /\[INFO\].*Publishing the states works again/);
});

test('a configuration problem is said once, at the start or the save', async (t) => {
  const lines = captureLogs(t, 'info');
  const w = await world(t, { latitude: 'abc', longitude: '2', radius: '1000', far_radius: '500' });
  for (let i = 0; i < 3; i += 1) {
    await tick(w);
  }
  assert.deepEqual(lines.map(strip).slice(0, 2), [
    '[WARN] [emsc] The coordinates of the configuration are not valid: the house is used',
    '[WARN] [emsc] Far zone ignored: its radius and magnitude must exceed those of the near zone',
  ]);
  assert.equal(lines.length, 4);
});
