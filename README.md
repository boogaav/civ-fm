# CIV FM — Earth Platform

A civilization dashboard for one human. The whole planet on a minimal 3D globe,
tuned like a radio — one frequency at a time, each channel answering a question
every citizen of Earth actually has.

Spec: https://claude.ai/code/artifact/5024b0e4-4ae7-4645-b146-7809fa48be20

## v0.2 — all eight channels live, Apple-style UI

| Freq  | Channel | Globe layer | HERE readouts |
|-------|---------|-------------|----------------|
| 88.0  | Air     | Live city temperatures (Open-Meteo) + day/night | Temp, AQI, UV, wind, sun, 24 h sparkline |
| 90.5  | Ground  | USGS quakes + NASA EONET fires/storms/volcanoes | Nearest hazards + distances |
| 93.0  | Water   | Water-stress choropleth (World Bank SDG 6.4.2) | Stress %, soil moisture, GloFAS river discharge, rain |
| 95.5  | Body    | Life-expectancy choropleth | Life expectancy, physicians, health spend |
| 98.0  | Grid    | NASA Black Marble — Earth at night | Electricity access, internet use |
| 100.5 | Money   | Sub-dial: GDP · Inflation · Gold reserves · Gov. debt choropleths | GDP, inflation, gold, debt, currency, live USD rate |
| 103.0 | People  | Population-density choropleth | Population, density, languages, capital |
| 105.5 | Signal  | ISS live + GDELT news pulses + terminator | UTC, sun elevation, ISS distance |

UI is macOS-style: system SF font stack, frosted-glass panels
(backdrop blur + hairlines), segmented-control dial, Apple system colors,
Maps-style blue location puck. Day/night terminator shows only on channels
where it means something (Air, Ground, Signal); data channels get full clarity.

## Disaster alerting (v0.3)

GDACS (the UN/EC multi-hazard feed: floods, cyclones, quakes, droughts,
wildfires, volcanoes — with Green/Orange/Red severity) is merged into Ground
via `civfm-proxy`, a Cloudflare Worker at
`https://civfm-proxy.boogaav.workers.dev/gdacs` that adds CORS + 5-min edge
caching (source in `proxy/`, deploy with `npx wrangler deploy`).

- Orange/Red alerts show as an always-visible pill on every channel;
  click it to fly to the newest event on Ground.
- Feeds auto-refresh in place: quakes every 2 min, GDACS every 5 min,
  EONET every 15 min — no reload needed.
- Ground's HERE panel includes the nearest Orange/Red alert and distance.

## /passport — PassportMap component

`passport/` is a standalone page built on `passport-map.js` + `passport-map.css`:
a dependency-free vanilla component mirroring the planned `@booga/passport-map`
React API:

```js
new PassportMap(el, {
  passport: "UKR",              // ISO3
  modes: ["visa", "tax"],
  showHeader: true,
  dataBaseUrl: "https://passport.booga.me/data/",  // optional; defaults to the
                                                   // ilyankou/passport-index-dataset GitHub raw
  onSelectCountry: (iso3, req) => {},
})
```

- **Visa mode** — the full visa-requirement map for any of ~199 passports
  (visa-free with days, visa on arrival, eTA, e-visa, required, no admission),
  with per-category counts and an openness summary.
- **Tax mode** — tax revenue as % of GDP (World Bank, 194 countries).
- Permalinks: `passport/#ESP` opens the Spanish passport. The People channel's
  HERE panel deep-links to your country's passport.
- Neither `@booga/passport-map` (npm) nor `passport.booga.me` exists yet —
  the component is ready to be wrapped/published when wanted.

## /relief — 3D terrain

`relief/` renders real elevation in 3D: AWS Open Data terrarium DEM tiles
(keyless) with MapLibre terrain + hillshading. Height exaggeration toggle
(1× / 1.5× / 2.5×), preset flyovers (Everest, Matterhorn, Grand Canyon, Fuji,
Fitz Roy, Kilimanjaro, Geirangerfjord, Table Mountain), and click-anywhere
elevation readout (corrected for exaggeration — MapLibre returns exaggerated
meters).

A **Borders** toggle (off by default) drapes country borders over the terrain,
which is where they get interesting: the Nepal/China line runs over Everest's
summit ridge, Italy/Switzerland over the Matterhorn. It restyles the basemap's
own `boundary_country_inner` layer and lifts it above the terrain layers —
amber on Dark, deep red on Nature. Only the country line is drawn; the wide
`boundary_country_outline` halo, `boundary_state`, and `boundary_county` are
hidden (clutter/muddiness over mountains).

Two styles: **Dark** (monochrome sculpture) and **Nature** — a light theme
using MapLibre's `color-relief` layer for hypsometric tinting (greens →
tans → browns → snow, plus blue bathymetry: terrarium tiles carry ocean
depth), with the page UI switching to light glass to match.

Version note: relief pins maplibre-gl **5.7.0** (first with `color-relief`).
5.24.0 breaks terrain here (tile-bounds + shader errors) — do not bump
blindly; the main app remains on 5.6.0.

## Data sources (all keyless, CORS-open, fetched client-side)

Open-Meteo (forecast, air quality, flood/GloFAS) · USGS · NASA EONET ·
NASA GIBS Black Marble tiles · World Bank API · wheretheiss.at ·
open.er-api.com (FX) · world-countries via jsDelivr (facts) ·
johan/world.geo.json (country shapes) · BigDataCloud reverse geocode ·
GDELT GEO (best-effort; degrades gracefully — their API host blocks CORS
and is intermittently down).

## Stack

MapLibre GL JS v5 globe projection, Carto dark-matter-nolabels basemap.
Zero build step, zero backend — static files only. Deploys to GitHub Pages as-is.

## Run

```
python3 -m http.server 8737 --directory .
```

Then open http://localhost:8737.

## v0.3 ideas

Wildfire hotspots via FIRMS key behind a Cloudflare Worker proxy, OpenSky
flights, freedom/passport layers (static bundles), per-channel audio
signatures, shareable permalinks (channel + location in the URL hash).

## Deploy

Live at **https://civ.fm** — GitHub Pages from `main` on
[boogaav/civ-fm](https://github.com/boogaav/civ-fm) (`CNAME` file sets the
domain). Deploying = `git push`. DNS at Namecheap: apex A records to GitHub
Pages IPs (185.199.108–111.153), `www` CNAME to `boogaav.github.io`.
The GDACS proxy Worker deploys separately: `cd proxy && npx wrangler deploy`.
