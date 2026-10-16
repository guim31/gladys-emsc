# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- A "Nearby earthquakes" device: magnitude, distance, depth, time and region of
  the latest earthquake of your zone, number of earthquakes and strongest
  magnitude in the last 24 hours.
- The followed zone: a radius and a minimum magnitude around your house (or
  around coordinates), and an optional far zone for strong earthquakes only.
- Live updates from the EMSC-CSEM real-time feed, caught up after an outage.
- Scene triggers "new earthquake in my zone" and "magnitude revised", with the
  details of the earthquake as variables.
- Scene action "read the recent earthquakes" (one sentence, count, strongest
  magnitude) and configuration action "Show the latest earthquakes".
- Dashboard widget listing the latest earthquakes of the zone.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-emsc/commits/main
