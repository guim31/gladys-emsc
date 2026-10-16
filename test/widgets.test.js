// -----------------------------------------------------------------------------
// The `earthquakes` widget and the two actions: contents within the core
// budget (validateWidgetContent: an empty array means rendered as sent), the
// order of the earthquakes, the texts of every language, and the sentence of
// the scene action and of the configuration action.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { MAX_ITEMS, magnitudeColor } from '../src/widgets.js';
import { GREECE_NEAR, createApi, createWorld, live } from './helpers/world.js';

async function world(t, config = {}, options = {}) {
  const w = await createWorld({ config, ...options });
  t.after(() => w.app.stop());
  return w;
}

const content = async (w, language) =>
  (await w.fake.widgetGet('earthquakes', { settings: {}, language })).data.content;

test('the widget lists the earthquakes of 7 days, newest first, within the budget', async (t) => {
  const w = await world(t);
  for (const language of LANGUAGES) {
    const widget = await content(w, language);
    assert.deepEqual(validateWidgetContent(widget), [], language);
    const list = widget.components.find((c) => c.type === 'card-list');
    assert.equal(list.items.length, 6);
    assert.equal(list.items[0].title, 'Aegean Sea');
    assert.equal(list.items[0].badge.color, 'info');
    assert.match(list.items[0].links[0].url, /^https:\/\/www\.emsc-csem\.org\//);
  }
  const fr = await content(w, 'fr');
  assert.equal(fr.components[0].text, '1 séisme en 24 h');
  const [first] = fr.components.find((c) => c.type === 'card-list').items;
  assert.equal(first.subtitle, '167 km · 16/10 06:31');
  assert.equal(first.badge.text, 'M2,7');
  assert.equal(
    first.description,
    'Magnitude : M2,7 (ml)\nProfondeur : 15 km\nHeure : 16/10/2026 06:31:12\nSignalé par : EMSC',
  );
  assert.equal(fr.components.at(-2).text, 'Source : EMSC-CSEM · 16/10 16:00');
  assert.deepEqual(fr.components.at(-1).link, { url: 'https://www.emsc-csem.org' });
});

test('the widget: at most 8 rows, the zone named when there are two', async (t) => {
  const w = await world(t, { min_magnitude: '2', far_radius: '1000', far_min_magnitude: '4' });
  for (let i = 0; i < 4; i += 1) {
    const feature = w.api.add(GREECE_NEAR, { id: `w${i}`, time: w.clock.now() - i * 60000 });
    await live(w, 'create', feature);
  }
  const widget = await content(w, 'en');
  assert.deepEqual(validateWidgetContent(widget), []);
  const list = widget.components.find((c) => c.type === 'card-list');
  assert.equal(list.items.length, MAX_ITEMS);
  assert.equal(widget.components[0].text, '5 earthquakes in 24 h');
  assert.match(list.items[0].description, /\nNear zone\n/);
});

test('the widget before any answer, and with an empty zone', async (t) => {
  const api = createApi();
  api.down = 503;
  const w = await world(t, {}, { api });
  const waiting = await content(w, 'de');
  assert.deepEqual(validateWidgetContent(waiting), []);
  assert.equal(waiting.components[0].text, 'Warte auf das EMSC…');
  const paris = await world(t, { latitude: '48.85', longitude: '2.35', radius: '25' });
  const empty = await content(paris, 'es');
  assert.equal(empty.components[0].text, 'Ningún terremoto en 24 h');
  assert.ok(!empty.components.some((c) => c.type === 'card-list'));
});

test('badge colours: info, then warning from M4, danger from M5', () => {
  assert.equal(magnitudeColor(3.9), 'info');
  assert.equal(magnitudeColor(4), 'warning');
  assert.equal(magnitudeColor(5.2), 'danger');
});

test('scene action: the earthquakes of 24 hours as one sentence, with count and maximum', async (t) => {
  const w = await world(t);
  const { data } = await w.fake.sceneAction('read_earthquakes', {});
  assert.deepEqual(data.outputs, {
    text: '1 séisme en 24 heures : M2,7 Aegean Sea, à 167 km, 16/10 06:31.',
    count: 1,
    max_magnitude: 2.7,
  });
  w.clock.advance(2 * 24 * 3600 * 1000);
  const later = await w.fake.sceneAction('read_earthquakes', {});
  assert.equal(
    later.data.outputs.text,
    'Aucun séisme dans votre zone en 24 heures. Dernier : M2,7 Aegean Sea, à 167 km, 16/10 06:31.',
  );
  assert.equal(later.data.outputs.max_magnitude, 0);
});

test('scene action without any answer of EMSC: an error in the configured language', async (t) => {
  const api = createApi();
  api.down = 'network';
  const w = await world(t, { language: 'en' }, { api });
  const result = await w.fake.sceneAction('read_earthquakes', {});
  assert.match(JSON.stringify(result), /The EMSC event service does not answer/);
});

test('configuration action: the same in every language, short enough for a toast', async (t) => {
  const w = await world(t, { min_magnitude: '2' });
  const { data } = await w.fake.action('check_now');
  const message = data.message ?? data;
  assert.deepEqual(Object.keys(message).sort(), [...LANGUAGES].sort());
  assert.match(message.de, /^\d+ Erdbeben in 24 Stunden: .* Geprüft um 16:00\.$/);
  for (const text of Object.values(message)) {
    assert.ok(text.length <= 200, text);
  }
});
