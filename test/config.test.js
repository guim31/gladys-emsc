// -----------------------------------------------------------------------------
// Normalization of the configuration: coordinates typed by hand, the two
// zones, and what happens to values the manifest does not offer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseCoordinate } from '../src/config.js';

test('the defaults: the house, 200 km and M2.5, no far zone, French', () => {
  assert.deepEqual(normalizeConfig(DEFAULT_CONFIG), {
    center: null,
    invalidCenter: false,
    near: { radiusKm: 200, minMagnitude: 2.5 },
    far: null,
    farIgnored: false,
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(undefined), normalizeConfig(DEFAULT_CONFIG));
});

test('coordinates: decimal comma, both or none, within bounds', () => {
  assert.equal(parseCoordinate('43,6045', 90), 43.6045);
  assert.equal(parseCoordinate(' -1.5 ', 180), -1.5);
  assert.equal(parseCoordinate('91', 90), null);
  assert.equal(parseCoordinate('1e3', 180), null);
  assert.equal(parseCoordinate('', 90), null);
  assert.deepEqual(normalizeConfig({ latitude: '43,6', longitude: '1,44' }).center, {
    latitude: 43.6,
    longitude: 1.44,
  });
  const half = normalizeConfig({ latitude: '43.6', longitude: '' });
  assert.equal(half.center, null);
  assert.equal(half.invalidCenter, true);
});

test('the far zone counts only when wider and stronger than the near one', () => {
  const far = normalizeConfig({ far_radius: '1000', far_min_magnitude: '5' });
  assert.deepEqual(far.far, { radiusKm: 1000, minMagnitude: 5 });
  assert.equal(far.farIgnored, false);
  const narrow = normalizeConfig({ radius: '1000', far_radius: '500' });
  assert.equal(narrow.far, null);
  assert.equal(narrow.farIgnored, true);
  const weak = normalizeConfig({ min_magnitude: '5', far_radius: '2000', far_min_magnitude: '4' });
  assert.equal(weak.far, null);
  assert.equal(weak.farIgnored, true);
});

test('a value the manifest does not offer falls back on the default', () => {
  const config = normalizeConfig({ radius: '7', min_magnitude: 'big', language: 'it' });
  assert.deepEqual(config.near, { radiusKm: 200, minMagnitude: 2.5 });
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ min_magnitude: 3 }).near.minMagnitude, 3);
});
