# Test fixtures

- `gladys-feature-table.json`: the category/type couples, units and poll frequencies the Gladys
  core knows, extracted from its code (see `test/gladys-rules.test.js`).
- `emsc/fdsn-aegean-2026-10-16.json`: the answer of the EMSC FDSN event service
  (`seismicportal.eu/fdsnws/event/1/query?format=json&lat=37.9838&lon=23.7275&maxradius=3&minmag=2&start=2026-10-13T00:00:00&end=2026-10-16T14:00:00`),
  unmodified: 13 earthquakes of magnitude 2 or more within about 330 km of Athens, from 13 to
  16/10/2026. The fake FDSN service of `test/helpers/world.js` serves them, filtered like the real
  service: tests stay within that radius and magnitude.
- `emsc/websocket-2026-10-16.json`: two messages of the EMSC real-time feed
  (`wss://www.seismicportal.eu/standing_order/websocket`), recorded on 16/10/2026, unmodified: a
  creation (Panama) and a revision (Bolivia).

Public data © EMSC-CSEM, CC BY 4.0; no personal data (Athens is the public centre of the city).
