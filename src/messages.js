// -----------------------------------------------------------------------------
// Texts sent from the container (feature values, connection status, action and
// scene messages, scene variables), in the four languages of the Gladys
// interface. Entries are strings or functions of one parameter object. German
// says "du", Spanish "usted". Region names come from EMSC, in English: they
// are not translated.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

export const ZONE_NAMES = {
  en: { near: 'Near zone', far: 'Far zone' },
  fr: { near: 'Zone proche', far: 'Zone lointaine' },
  de: { near: 'Nahe Zone', far: 'Ferne Zone' },
  es: { near: 'Zona cercana', far: 'Zona lejana' },
};

// Scene messages and the sentence of the action.
export const PHRASES = {
  en: {
    item: ({ what, region, km, time }) => `${what} ${region}, ${km} km away, ${time}`,
    list: ({ head, items }) => `${head}: ${items.join('; ')}.`,
    more: ({ count }) => `and ${count} more`,
    day: ({ count }) =>
      count === 1 ? '1 earthquake in 24 hours' : `${count} earthquakes in 24 hours`,
    none: 'No earthquake in your area in 24 hours.',
    latest: ({ text }) => `Latest: ${text}.`,
  },
  fr: {
    item: ({ what, region, km, time }) => `${what} ${region}, à ${km} km, ${time}`,
    list: ({ head, items }) => `${head} : ${items.join(' ; ')}.`,
    more: ({ count }) => `et ${count} de plus`,
    day: ({ count }) => (count === 1 ? '1 séisme en 24 heures' : `${count} séismes en 24 heures`),
    none: 'Aucun séisme dans votre zone en 24 heures.',
    latest: ({ text }) => `Dernier : ${text}.`,
  },
  de: {
    item: ({ what, region, km, time }) => `${what} ${region}, ${km} km entfernt, ${time}`,
    list: ({ head, items }) => `${head}: ${items.join('; ')}.`,
    more: ({ count }) => `und ${count} weitere`,
    day: ({ count }) =>
      count === 1 ? '1 Erdbeben in 24 Stunden' : `${count} Erdbeben in 24 Stunden`,
    none: 'Kein Erdbeben in deinem Gebiet in 24 Stunden.',
    latest: ({ text }) => `Letztes: ${text}.`,
  },
  es: {
    item: ({ what, region, km, time }) => `${what} ${region}, a ${km} km, ${time}`,
    list: ({ head, items }) => `${head}: ${items.join('; ')}.`,
    more: ({ count }) => `y ${count} más`,
    day: ({ count }) =>
      count === 1 ? '1 terremoto en 24 horas' : `${count} terremotos en 24 horas`,
    none: 'Ningún terremoto en su zona en 24 horas.',
    latest: ({ text }) => `Último: ${text}.`,
  },
};

// Connection status of the Configuration screen, and messages of the actions.
export const STATUS = {
  en: {
    serviceDown: 'The EMSC event service does not answer: try again later.',
    initFailed: 'Initialization failed, check the integration logs.',
    feedDown: 'The EMSC real-time feed is lost: reconnecting.',
    noCenter:
      'No centre: give your house a location in Gladys (Settings, Houses) or type coordinates.',
    invalidCenter: 'The coordinates are not valid: the location of your house is used.',
    farIgnored:
      'Far zone ignored: its radius and its magnitude must both be above those of the near zone.',
    truncated:
      'Many earthquakes in your zone: only the latest ones are kept. Raise the minimum magnitude.',
    summary: ({ text, time }) => `${text} Checked at ${time}.`,
  },
  fr: {
    serviceDown: 'Le service d’événements de l’EMSC ne répond pas : réessayez plus tard.',
    initFailed: "L'initialisation a échoué, consultez les logs de l'intégration.",
    feedDown: 'Le flux temps réel de l’EMSC est coupé : reconnexion en cours.',
    noCenter:
      'Aucun centre : indiquez la position de votre maison dans Gladys (Paramètres, Maisons) ou saisissez des coordonnées.',
    invalidCenter:
      'Les coordonnées ne sont pas valides : la position de votre maison est utilisée.',
    farIgnored:
      'Zone lointaine ignorée : son rayon et sa magnitude doivent dépasser ceux de la zone proche.',
    truncated:
      'Beaucoup de séismes dans votre zone : seuls les derniers sont gardés. Relevez la magnitude minimale.',
    summary: ({ text, time }) => `${text} Vérifié à ${time}.`,
  },
  de: {
    serviceDown: 'Der Ereignisdienst des EMSC antwortet nicht: Versuch es später erneut.',
    initFailed: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    feedDown: 'Der Echtzeit-Feed des EMSC ist unterbrochen: Verbindung wird wiederhergestellt.',
    noCenter:
      'Kein Mittelpunkt: Gib deinem Haus in Gladys einen Standort (Einstellungen, Häuser) oder trage Koordinaten ein.',
    invalidCenter: 'Die Koordinaten sind ungültig: Der Standort deines Hauses wird verwendet.',
    farIgnored:
      'Ferne Zone ignoriert: Radius und Magnitude müssen beide über denen der nahen Zone liegen.',
    truncated:
      'Viele Erdbeben in deinem Gebiet: Nur die letzten werden behalten. Erhöhe die Mindestmagnitude.',
    summary: ({ text, time }) => `${text} Geprüft um ${time}.`,
  },
  es: {
    serviceDown: 'El servicio de eventos del EMSC no responde: inténtelo más tarde.',
    initFailed: 'La inicialización ha fallado, consulte los registros de la integración.',
    feedDown: 'El flujo en tiempo real del EMSC está cortado: reconectando.',
    noCenter:
      'Sin centro: indique la ubicación de su casa en Gladys (Ajustes, Casas) o introduzca coordenadas.',
    invalidCenter: 'Las coordenadas no son válidas: se usa la ubicación de su casa.',
    farIgnored:
      'Zona lejana ignorada: su radio y su magnitud deben superar los de la zona cercana.',
    truncated:
      'Muchos terremotos en su zona: solo se guardan los últimos. Suba la magnitud mínima.',
    summary: ({ text, time }) => `${text} Comprobado a las ${time}.`,
  },
};

/** One entry of a message table, in every language: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const entry = table[language][key];
      return [language, typeof entry === 'function' ? entry(params) : entry];
    }),
  );
}

/** Several multi-language texts joined, language by language. */
export function join(...messages) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      messages
        .filter(Boolean)
        .map((message) => message[language])
        .join(' '),
    ]),
  );
}

const locale = (language) => (language === 'en' ? 'en-GB' : language);

/** A date in the user's time zone (TZ, set by the Gladys supervisor), e.g. "13/10 18:35". */
export function formatDate(time, language) {
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** A full date, e.g. "13/10/2026 18:35:12": the value of the "time" feature. */
export function formatFullDate(time, language) {
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(time));
}

/** A time of day, e.g. "18:35". */
export function formatTime(time, language) {
  return new Intl.DateTimeFormat(locale(language), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** A number in the user's language, e.g. "1 234" or "4,5" in French. */
export function formatNumber(value, language, digits = 0) {
  return new Intl.NumberFormat(locale(language), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

/** "M3.2" ("M3,2" in French). */
export const magnitudeText = (event, language) => `M${formatNumber(event.magnitude, language, 1)}`;

export const km = (distance, language) => formatNumber(Math.round(distance), language);

/** "M3.2 Southern Greece, 168 km away, 14/10 07:25". */
export function describe(event, language) {
  return PHRASES[language].item({
    what: magnitudeText(event, language),
    region: event.region,
    km: km(event.distanceKm, language),
    time: formatDate(event.time, language),
  });
}

// Earthquakes named in one sentence: a scene that reads it aloud stays short.
export const SENTENCE_EVENTS = 5;

/**
 * The earthquakes of the last 24 hours as one sentence, newest first, e.g.
 * "2 earthquakes in 24 hours: M2.7 Aegean Sea, 167 km away, 16/10 06:31; …".
 * Without any, the latest known one, if there is.
 */
export function sentence(day, latest, language, max = SENTENCE_EVENTS) {
  const p = PHRASES[language];
  if (day.length === 0) {
    return latest ? `${p.none} ${p.latest({ text: describe(latest, language) })}` : p.none;
  }
  const parts = day.slice(0, max).map((event) => describe(event, language));
  const rest = day.length - max;
  if (rest > 0) {
    parts.push(p.more({ count: rest }));
  }
  return p.list({ head: p.day({ count: day.length }), items: parts });
}
