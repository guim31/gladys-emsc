// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Select values are strings in the manifest (stored by Gladys as typed); the
// normalized config holds numbers. Magnitudes are selects: a number field has
// no `step` in the Gladys form, so 2.5 could not be typed.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Kilometres around the centre for the "near" zone: the earthquakes felt at
// home. A magnitude 3 is felt up to a few tens of kilometres, a magnitude 5
// up to a few hundred.
export const RADII = ['25', '50', '100', '200', '300', '500', '1000'];
export const MIN_MAGNITUDES = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'];

// The optional "far but strong" zone: '0' turns it off.
export const FAR_RADII = ['0', '500', '1000', '2000', '3000'];
export const FAR_MIN_MAGNITUDES = ['4', '4.5', '5', '5.5', '6', '6.5', '7'];

export const DEFAULT_CONFIG = {
  latitude: '',
  longitude: '',
  radius: '200',
  min_magnitude: '2.5',
  far_radius: '0',
  far_min_magnitude: '5.5',
  language: 'fr',
};

/** A coordinate typed by the user (decimal comma accepted), null if blank or invalid. */
export function parseCoordinate(value, limit) {
  const text = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    return null;
  }
  const number = Number(text);
  return Math.abs(number) <= limit ? number : null;
}

const pick = (value, allowed, fallback) =>
  allowed.includes(String(value)) ? Number(value) : Number(fallback);

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const latitude = parseCoordinate(source.latitude, 90);
  const longitude = parseCoordinate(source.longitude, 180);
  // Both or none: half a centre falls back on the house.
  const center = latitude !== null && longitude !== null ? { latitude, longitude } : null;
  const typed = String(source.latitude ?? '').trim() + String(source.longitude ?? '').trim();
  const near = {
    radiusKm: pick(source.radius, RADII, DEFAULT_CONFIG.radius),
    minMagnitude: pick(source.min_magnitude, MIN_MAGNITUDES, DEFAULT_CONFIG.min_magnitude),
  };
  const farRadius = pick(source.far_radius, FAR_RADII, DEFAULT_CONFIG.far_radius);
  const far = {
    radiusKm: farRadius,
    minMagnitude: pick(
      source.far_min_magnitude,
      FAR_MIN_MAGNITUDES,
      DEFAULT_CONFIG.far_min_magnitude,
    ),
  };
  // The far zone only adds something when it is wider than the near one and
  // asks for more: otherwise the near zone already holds everything it would.
  const farUseful = farRadius > near.radiusKm && far.minMagnitude > near.minMagnitude;
  return {
    center,
    // Something was typed but is not a pair of coordinates: said once in the logs.
    invalidCenter: center === null && typed !== '',
    near,
    far: farUseful ? far : null,
    // The far zone is set but adds nothing: said in the status.
    farIgnored: farRadius > 0 && !farUseful,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
