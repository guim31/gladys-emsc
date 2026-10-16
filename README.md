# EMSC Earthquakes for Gladys Assistant

The earthquakes near your home in [Gladys Assistant](https://gladysassistant.com), live, as
reported by the [EMSC-CSEM](https://www.emsc-csem.org) (European-Mediterranean Seismological
Centre): magnitude, distance, depth, time and region of the latest one, how many in the last 24
hours, scene triggers and a dashboard widget. Made for the earthquakes you may feel at home
(Pyrenees, Alps, Provence, Italy, Greece, the French West Indies…). No account, no API key.

Not an early warning system: an earthquake is reported minutes after it happened. Not affiliated
with EMSC.

## Features

- **A "Nearby earthquakes" device**: magnitude, distance, depth, time and region of the latest
  earthquake of your zone, number of earthquakes in 24 hours, strongest magnitude in 24 hours; with
  history.
- **The followed zone**: a radius and a minimum magnitude around your house (or around
  coordinates), plus an optional wider zone for strong earthquakes only.
- **Live**: the EMSC real-time WebSocket feed, caught up through the FDSN event service at the start
  and after an outage, so nothing is missed.
- **Scene triggers**: a new earthquake in your zone, a magnitude revised by 0.5 or more; filtered
  by zone, with magnitude, distance, depth, region, time and EMSC page as scene variables.
- **Scene action**: the earthquakes of the last 24 hours as one sentence, to send by message or
  have read aloud, with their number and the strongest magnitude.
- **Dashboard widget**: the latest earthquakes of the zone (7 days), newest first, each with its
  EMSC page.
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1 or later.
- Internet access from the Gladys host (`www.seismicportal.eu`, HTTPS and WebSocket).
- A location for your house in Gladys, or coordinates in the configuration.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-emsc` (or install it from the catalog once it is listed). The
   install screen shows the **location** access it asks for (the centre of the zone).
2. In **Configuration**, choose the radius and the minimum magnitude (and the far zone if you
   wish), then save. **Show the latest earthquakes** lists what your settings catch.
3. Open the **Discover** tab and add the **Nearby earthquakes** device.

The full guide is in [docs/en.md](docs/en.md) ([fr](docs/fr.md), [de](docs/de.md),
[es](docs/es.md)).

## How it works

- One WebSocket connection to `wss://www.seismicportal.eu/standing_order/websocket`, which sends a
  message for every earthquake created or revised in the world; the integration keeps those of
  your zone. The connection is reopened when lost (5 s, then up to 5 min between attempts), and
  after two hours without any message.
- At the start, after an outage and when the zone changes, one FDSN request per zone
  (`/fdsnws/event/1/query`, last 7 days) catches up what the feed could not deliver; after outages, never more
  often than every 5 minutes. The service is never polled.
- "New earthquake" fires for an earthquake less than an hour old; what is in the zone when it is
  first set, or after a change of zone, fires nothing. The earthquakes seen are kept under `/data`,
  so a restart fires nothing twice. Only a hash of the zone is stored, never your coordinates.

## Limitations

- Not an early warning system; the first magnitudes are automatic and often revised.
- The distance is measured to the epicentre.
- One zone per Gladys.
- Region names are those of EMSC (Flinn-Engdahl regions, in English).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys, a fake FDSN service serving real earthquakes recorded
on 16/10/2026 and a fake WebSocket replaying real feed messages (`test/fixtures/emsc/`): never the
network.

## Credits

- Data: [EMSC-CSEM](https://www.emsc-csem.org), through the
  [SeismicPortal](https://www.seismicportal.eu), under the CC BY 4.0 licence (see its
  [terms](https://www.seismicportal.eu/terms.html)). Credit: EMSC-CSEM, https://www.emsc-csem.org.
- The Home Assistant [GeoJSON events](https://www.home-assistant.io/integrations/geo_json_events/)
  platform and the community `emsc_earthquakes` integration showed what users expect from such an
  integration; no code is copied from them.
- Built on the [Gladys integration SDK](https://github.com/GladysAssistant/integration-sdk-js) and
  the official JavaScript template.

## License

[Apache 2.0](LICENSE).
