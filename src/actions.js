// -----------------------------------------------------------------------------
// The scene action `read_earthquakes` and the configuration action
// `check_now`. Both answer with the earthquakes of the zone over the last 24
// hours as one sentence, newest first: something a scene can send by message
// or read aloud. The feed keeps them current: EMSC is read again only when the
// zone was never caught up.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from './config.js';
import { STATUS, formatTime, render, sentence } from './messages.js';

const logger = createLogger({ name: 'emsc-actions' });

export const SCENE_ACTION = 'read_earthquakes';
export const CONFIG_ACTION = 'check_now';

const notReady = (monitor) => render(STATUS, monitor.centerValue ? 'serviceDown' : 'noCenter');

// A toast is cut at 200 characters: three earthquakes fit.
const TOAST_EVENTS = 3;

/** Scene action: outputs `text`, `count` and `max_magnitude`; throws if the zone is unknown. */
export async function readEarthquakes(monitor) {
  const { day, last, ok } = await monitor.fresh();
  if (!ok) {
    throw new Error(notReady(monitor)[monitor.config.language]);
  }
  return {
    text: sentence(day, last, monitor.config.language),
    count: day.length,
    max_magnitude: Math.max(0, ...day.map((event) => event.magnitude)),
  };
}

/** Configuration action: the earthquakes of the zone now, in every language. */
export async function checkNow(monitor) {
  const { day, last, ok } = await monitor.fresh();
  logger.info(
    `Check requested: ${ok ? `${day.length} earthquake(s) in 24 hours` : 'zone not caught up'}`,
  );
  if (!ok) {
    return notReady(monitor);
  }
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      render(STATUS, 'summary', {
        text: sentence(day, last, language, TOAST_EVENTS),
        time: formatTime(monitor.now(), language),
      })[language],
    ]),
  );
}
