// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `earthquakes`.
//
// A heading with the number of earthquakes in 24 hours, then the latest ones
// of the zone over 7 days as a `card-list` (8 rows at most, the core's cap),
// newest first: the region as title, the distance and the local time as
// subtitle, the magnitude as a coloured badge. Tapping a row opens the core's
// detail panel: magnitude type, depth, full time, zone, reporting agency, and
// a link to the EMSC page of the earthquake (felt reports). The footer gives
// the source and the time of the last update, and a link to the EMSC site.
// Budget: 2 texts, 1 card-list, 1 button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from './config.js';
import { EMSC_SITE } from './emsc.js';
import {
  ZONE_NAMES,
  formatDate,
  formatFullDate,
  formatNumber,
  km,
  magnitudeText,
} from './messages.js';
import { WIDGET_KEY } from './monitor.js';

export const MAX_ITEMS = 8;
export const TTL_SECONDS = 300;

export const TEXT = {
  waiting: {
    en: 'Waiting for EMSC…',
    fr: 'En attente de l’EMSC…',
    de: 'Warte auf das EMSC…',
    es: 'Esperando al EMSC…',
  },
  none: {
    en: 'No earthquake in 24 h',
    fr: 'Aucun séisme en 24 h',
    de: 'Kein Erdbeben in 24 h',
    es: 'Ningún terremoto en 24 h',
  },
  one: {
    en: '1 earthquake in 24 h',
    fr: '1 séisme en 24 h',
    de: '1 Erdbeben in 24 h',
    es: '1 terremoto en 24 h',
  },
  many: {
    en: ' earthquakes in 24 h',
    fr: ' séismes en 24 h',
    de: ' Erdbeben in 24 h',
    es: ' terremotos en 24 h',
  },
  source: {
    en: 'Source: EMSC-CSEM',
    fr: 'Source : EMSC-CSEM',
    de: 'Quelle: EMSC-CSEM',
    es: 'Fuente: EMSC-CSEM',
  },
  magnitude: { en: 'Magnitude', fr: 'Magnitude', de: 'Magnitude', es: 'Magnitud' },
  depth: { en: 'Depth', fr: 'Profondeur', de: 'Tiefe', es: 'Profundidad' },
  time: { en: 'Time', fr: 'Heure', de: 'Zeit', es: 'Hora' },
  agency: { en: 'Reported by', fr: 'Signalé par', de: 'Gemeldet von', es: 'Informado por' },
  page: { en: 'EMSC page', fr: 'Page EMSC', de: 'EMSC-Seite', es: 'Página EMSC' },
  site: { en: 'EMSC', fr: 'EMSC', de: 'EMSC', es: 'EMSC' },
};

const t = (text, language) => text[language] ?? text.en;
const clip = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** Colour of a magnitude badge: felt by all from 4, damaging from 5. */
export function magnitudeColor(magnitude) {
  if (magnitude >= 5) {
    return WIDGET_COLORS.DANGER;
  }
  if (magnitude >= 4) {
    return WIDGET_COLORS.WARNING;
  }
  return WIDGET_COLORS.INFO;
}

function heading(day, language) {
  if (day.length === 0) {
    return t(TEXT.none, language);
  }
  return day.length === 1 ? t(TEXT.one, language) : `${day.length}${t(TEXT.many, language)}`;
}

/** One row of the list, and its detail panel. */
export function itemOf(event, language, withZone) {
  const magnitude = `${magnitudeText(event, language)}${event.magnitudeType ? ` (${event.magnitudeType})` : ''}`;
  // French typography: a space before the colon.
  const label = (text) => `${t(text, language)}${language === 'fr' ? ' :' : ':'} `;
  const lines = [
    `${label(TEXT.magnitude)}${magnitude}`,
    event.depthKm === null
      ? null
      : `${label(TEXT.depth)}${formatNumber(event.depthKm, language)} km`,
    `${label(TEXT.time)}${formatFullDate(event.time, language)}`,
    withZone ? ZONE_NAMES[language][event.zone] : null,
    event.authority ? `${label(TEXT.agency)}${event.authority}` : null,
  ];
  return {
    title: clip(event.region || magnitudeText(event, language), 60),
    subtitle: clip(
      `${km(event.distanceKm, language)} km · ${formatDate(event.time, language)}`,
      60,
    ),
    badge: { text: magnitudeText(event, language), color: magnitudeColor(event.magnitude) },
    description: lines.filter(Boolean).join('\n'),
    links: [{ url: event.url, label: t(TEXT.page, language) }],
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { language = 'en' } = {}) {
      const lang = LANGUAGES.includes(language) ? language : 'en';
      const source = t(TEXT.source, lang);
      const updated = monitor.lastUpdateAt;
      const components = [
        {
          type: 'text',
          variant: 'heading',
          text: monitor.synced ? heading(monitor.day(), lang) : t(TEXT.waiting, lang),
        },
      ];
      const events = monitor.synced ? monitor.data.events.slice(0, MAX_ITEMS) : [];
      if (events.length > 0) {
        const withZone = Boolean(monitor.config?.far);
        components.push({
          type: 'card-list',
          display: 'list',
          items: events.map((event) => itemOf(event, lang, withZone)),
        });
      }
      components.push(
        {
          type: 'text',
          variant: 'caption',
          text: updated === null ? source : `${source} · ${formatDate(updated, lang)}`,
        },
        {
          type: 'button',
          label: t(TEXT.site, lang),
          icon: 'external-link',
          link: { url: EMSC_SITE },
        },
      );
      return { ttl_seconds: TTL_SECONDS, components };
    },
  },
};
