// -----------------------------------------------------------------------------
// The one Gladys device of the integration: the earthquakes of the followed
// zone (the near zone, and the "far but strong" one when set).
//
// Features (couples checked against the Gladys front, see
// test/gladys-rules.test.js):
//   - last_magnitude     sismic-sensor/decimal: magnitude of the latest earthquake;
//   - last_distance      distance-sensor/decimal, km: its distance to the centre;
//   - last_depth         distance-sensor/decimal, km: its depth;
//   - last_time          text/text: its date and time, in the time zone of Gladys;
//   - last_region        text/text: its region (Flinn-Engdahl, as EMSC names it);
//   - count_24h          counter-sensor/integer: earthquakes of the last 24 hours;
//   - max_magnitude_24h  sismic-sensor/decimal: the strongest of the last 24
//                        hours, 0 when there is none.
//
// Published with should_poll: false: the feed pushes, and a timer of the
// container ages the 24-hour values (src/monitor.js). The platform id is
// fixed: there is one zone per Gladys.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'earthquakes';
export const PLATFORM_ID = 'zone';
export const FEATURE_KEYS = {
  MAGNITUDE: 'last_magnitude',
  DISTANCE: 'last_distance',
  DEPTH: 'last_depth',
  TIME: 'last_time',
  REGION: 'last_region',
  COUNT: 'count_24h',
  MAX: 'max_magnitude_24h',
};

// Display bounds (the core never enforces them): the largest magnitude ever
// measured is 9.5, the farthest point on Earth 20,038 km away, the deepest
// earthquakes about 700 km down; EMSC gives a few depths above sea level.
export const MAX_MAGNITUDE = 10;
export const MAX_DISTANCE_KM = 20038;
export const MIN_DEPTH_KM = -10;
export const MAX_DEPTH_KM = 800;
export const MAX_COUNT = 10000;

// Feature names, frozen at creation in Gladys (language of the configuration).
export const NAMES = {
  en: {
    device: 'Nearby earthquakes',
    last_magnitude: 'Latest earthquake magnitude',
    last_distance: 'Latest earthquake distance',
    last_depth: 'Latest earthquake depth',
    last_time: 'Latest earthquake time',
    last_region: 'Latest earthquake region',
    count_24h: 'Earthquakes in 24 h',
    max_magnitude_24h: 'Strongest magnitude in 24 h',
  },
  fr: {
    device: 'Séismes proches',
    last_magnitude: 'Magnitude du dernier séisme',
    last_distance: 'Distance du dernier séisme',
    last_depth: 'Profondeur du dernier séisme',
    last_time: 'Heure du dernier séisme',
    last_region: 'Région du dernier séisme',
    count_24h: 'Séismes sur 24 h',
    max_magnitude_24h: 'Plus forte magnitude sur 24 h',
  },
  de: {
    device: 'Erdbeben in der Nähe',
    last_magnitude: 'Magnitude des letzten Bebens',
    last_distance: 'Entfernung des letzten Bebens',
    last_depth: 'Tiefe des letzten Bebens',
    last_time: 'Zeit des letzten Bebens',
    last_region: 'Region des letzten Bebens',
    count_24h: 'Erdbeben in 24 h',
    max_magnitude_24h: 'Stärkste Magnitude in 24 h',
  },
  es: {
    device: 'Terremotos cercanos',
    last_magnitude: 'Magnitud del último terremoto',
    last_distance: 'Distancia del último terremoto',
    last_depth: 'Profundidad del último terremoto',
    last_time: 'Hora del último terremoto',
    last_region: 'Región del último terremoto',
    count_24h: 'Terremotos en 24 h',
    max_magnitude_24h: 'Magnitud máxima en 24 h',
  },
};

/** External ids of the device and of its features. */
export function deviceIds(gladys) {
  const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_ID);
  return {
    device: ids.device,
    magnitude: ids.feature(FEATURE_KEYS.MAGNITUDE),
    distance: ids.feature(FEATURE_KEYS.DISTANCE),
    depth: ids.feature(FEATURE_KEYS.DEPTH),
    time: ids.feature(FEATURE_KEYS.TIME),
    region: ids.feature(FEATURE_KEYS.REGION),
    count: ids.feature(FEATURE_KEYS.COUNT),
    max: ids.feature(FEATURE_KEYS.MAX),
  };
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

/** The discovery payload of the device. */
export function buildDevice(gladys, language = 'fr') {
  const ids = deviceIds(gladys);
  const names = NAMES[language] ?? NAMES.fr;
  const { SISMIC_SENSOR, DISTANCE_SENSOR, COUNTER_SENSOR, TEXT } = DEVICE_FEATURE_CATEGORIES;
  const km = DEVICE_FEATURE_UNITS.KM;
  const text = { keep_history: false, min: 0, max: 0 };
  return {
    name: names.device,
    external_id: ids.device,
    model: 'EMSC',
    should_poll: false,
    params: [],
    features: [
      sensor(names.last_magnitude, ids.magnitude, SISMIC_SENSOR, TYPES.SENSOR.DECIMAL, {
        keep_history: true,
        min: 0,
        max: MAX_MAGNITUDE,
      }),
      sensor(names.last_distance, ids.distance, DISTANCE_SENSOR, TYPES.SENSOR.DECIMAL, {
        unit: km,
        keep_history: true,
        min: 0,
        max: MAX_DISTANCE_KM,
      }),
      sensor(names.last_depth, ids.depth, DISTANCE_SENSOR, TYPES.SENSOR.DECIMAL, {
        unit: km,
        keep_history: true,
        min: MIN_DEPTH_KM,
        max: MAX_DEPTH_KM,
      }),
      sensor(names.last_time, ids.time, TEXT, TYPES.TEXT.TEXT, text),
      sensor(names.last_region, ids.region, TEXT, TYPES.TEXT.TEXT, text),
      sensor(names.count_24h, ids.count, COUNTER_SENSOR, TYPES.SENSOR.INTEGER, {
        keep_history: true,
        min: 0,
        max: MAX_COUNT,
      }),
      sensor(names.max_magnitude_24h, ids.max, SISMIC_SENSOR, TYPES.SENSOR.DECIMAL, {
        keep_history: true,
        min: 0,
        max: MAX_MAGNITUDE,
      }),
    ],
  };
}
