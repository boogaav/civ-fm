# CIV FM — Earth Platform

A civilization dashboard for one human. The whole planet on a minimal 3D globe,
tuned like a radio — one frequency at a time, each channel answering a question
every citizen of Earth actually has.

Spec: https://claude.ai/code/artifact/5024b0e4-4ae7-4645-b146-7809fa48be20

## The dial — seven channels, Apple-style UI

Air, Ground and Water were merged into one **Earth** channel, and Signal into **People**, each as a sub-dial (2026-09-22); the original implementations live on as sub-views.

| Freq  | Channel | Globe layer | HERE readouts |
|-------|---------|-------------|----------------|
| 88.0  | Earth   | Sub-dial: Air (live city temperatures + day/night) · Ground (USGS quakes, GDACS alerts, EONET events) · Water (water-stress choropleth) | Air: temp, AQI, UV, wind, sun, 24 h sparkline · Ground: nearest hazards · Water: stress %, soil moisture, river discharge, rain |
| 95.5  | Body    | Sub-dial: Life · Cannabis · Alcohol · Tobacco · Psychedelics · Decrim (what's legal where, curated) | Life expectancy, physicians, health spend; "what's legal here" card |
| 98.0  | Grid    | NASA Black Marble — Earth at night | Electricity access, internet use |
| 100.5 | Money   | Sub-dial: GDP · Inflation · Gold reserves · Gov. debt · Income tax · Corporate tax | GDP, inflation, gold, debt, currency, live USD rate, top income + corporate tax |
| 106.5 | Future  | Sub-dial: Outlook · Climate zone · Crops · Warming — all 4,595 first-level regions under the worst-case SSP5-8.5 pathway, 2026–2125, with a year bar (play, slider, Central / High-end sensitivity) | Local warming, net outlook (gain vs risk) for the region and nationwide, Köppen zone today → year, climate twin ("feels like today's …"), growing season, crop potential, summer highs / winter lows, new or lost crops, top gains and risks |
| 103.0 | People  | Sub-dial: Density · Reading (what each country read yesterday on Wikipedia) · Ballot (days until each country votes) · Signal (live Wikipedia edit pulses, ISS with trail, next-launch marker, GDELT news when up, terminator) | Population/density/languages · top-10 articles + Google Trends · upcoming elections with Wikidata links · UTC, sun, wiki edits/min, ISS, launch countdown |
| 108.0 | Radio   | Sub-dial: Popular · Rising · News — countries shaded by how many radio stations stream online (log scale) | Click a country: its stations, most listened first. Click one to tune in. The player sits at the top of the HERE panel and keeps playing on every channel |

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

## People › Signal — the live nervous system

- **Wikipedia pulses**: one SSE connection to Wikimedia EventStreams; every
  human (non-bot) edit becomes a fading blip placed by the wiki's language →
  country centroid(s), plus a live edits/min counter. Pauses when the tab is
  hidden.
- **Next launch**: pad marker + T-countdown from Launch Library (fetched
  directly — they send CORS `*`; 15-min client cache respects their rate limit).
- **ISS trail**: fading MultiLineString of sampled positions (antimeridian-safe).
- **News (GDELT)** routes via the proxy — dormant while their API is down,
  lights up automatically when it returns.
- **Flights are dormant**: OpenSky 522s and adsb.fi/adsb.lol 403 Cloudflare
  Worker egress, and all block browser CORS. The `/opensky` route + the
  client's dead-reckoning renderer are in place; adding OpenSky OAuth
  credentials to the Worker later revives planes with zero client changes.

## Future — the worst-case century

`future/` holds a climate emulator and its data; `future/future.js` is the
channel and registers itself as `CHANNELS.future` after `app.js` loads.

- **Data** — `future/regions.json` (TopoJSON, ~1.9 MB, fetched only when
  Future is tuned): Natural Earth admin-1 regions with WorldClim 2.1
  monthly min/max temperature and rainfall (1970–2000) aggregated per
  region, plus precomputed centroid, area and a coastal flag.
- **Model** — `future/model.js` (`window.Model`, no dependencies). IPCC AR6
  SSP5-8.5 global warming, scaled per region (land/Arctic amplification,
  seasonal shape, rainfall percent per degree). From the projected monthly
  climate it derives Köppen-Geiger zones (Beck et al. 2018), growing season,
  frost-free days, permafrost climate, heating/cooling degree-days, FAO
  EcoCrop suitability for eight crops with a heat-damage penalty, AR6
  extreme-event multipliers, sea level, Arctic shipping season, and climate
  twins (nearest present-day analog, Fitzpatrick & Dunn 2019).
- **Outlook** — opportunity (crop gains, longer seasons, lower heating,
  wetter drylands, permafrost retreat, Arctic routes) minus risk (warming,
  crop loss, drought, sea level, cooling demand, humid heat, thaw damage,
  fire weather). Weights are CIV FM's own, for comparing places.
- **Rendering** — one GeoJSON source; each region's colour is set with
  `setFeatureState`, so scrubbing years never re-tiles.
- The same engine powers the standalone Hothouse Atlas artifact. It is an
  emulator for direction and rough size, not a forecast: soils, irrigation,
  CO₂ fertilisation and local effects (mountains, monsoon shifts) are not
  modelled.

## Radio — what is on the air

`radio.js` registers the channel the same way `future/future.js` does
(`CHANNELS.radio = …`), so `app.js` only knows about it through one teardown
hook.

- **Directory:** [Radio Browser](https://www.radio-browser.info/), a community
  database with an open, CORS-enabled API and no key. Three mirrors are tried
  in order (`de1`, `de2`, `all`); the first that answers is remembered.
  `/json/countries` feeds the choropleth, `/json/stations/search?countrycode=CC`
  feeds the list (top 100 by listens, `hidebroken=true`, `is_https=true`).
- **HTTPS only.** A browser will not play a plain-http stream on an https
  page, so those stations are left out. The map tooltip shows every listed
  station; the list shows the ones that can actually play, which is fewer.
- **Which country:** the coloured shape under the click wins, so the list
  matches what was clicked. Small countries the low-resolution shapes miss
  (Singapore, Malta) fall back to the reverse-geocoded country.
- **Player:** one `<audio>` element. HLS streams (`.m3u8`, common in Vietnam)
  go through hls.js, loaded from unpkg when Radio is tuned; Safari plays HLS
  natively. Chromium also claims native HLS but fails on live radio, so it is
  not trusted. A station silent for 20 s, or erroring, is marked "No signal"
  and struck through for the session. Next skips to the following live one.
- **Sub-dial** filters the same 100 stations client-side: Popular (listens),
  Rising (click trend), News (tags or name match news/talk).
- Each play is reported to the directory (`/json/url/{uuid}`), as its API asks,
  since that is what ranks stations.
- Station names and tags are user-contributed and are HTML-escaped.

## Money sub-dials — tax

`taxes.js` is a curated snapshot (dated in the file, shown in the UI) of
statutory headline rates: **top personal income-tax rate** (national; typical
sub-national or surtaxes in the note — e.g. US 37% federal + state, Japan
45% + 10% local) and **corporate income-tax rate** (combined where
sub-national applies, e.g. Germany ≈29.9%, Canada ≈26.2%). ~135 countries
each; unlisted countries show no data. Rates are before deductions, credits,
treaties and special regimes — Malta's 35% headline is ≈5% effective after
refunds, which the note says. There is no keyless API for statutory rates
(the World Bank only has tax *revenue* % of GDP), so this is hand-maintained;
edit `taxes.js` to update.

## Body sub-dials — what's legal here

`substances.js` is a curated snapshot (dated in the file, shown in the UI)
of substance law by country: **cannabis** (legal / varies by state /
decriminalised-tolerated / medical / illegal / severe), **alcohol** (legal /
restricted / banned), **tobacco & nicotine vapes** (legal / restricted /
vapes banned), **psychedelics** (psilocybin and natural psychedelics) and
**decrim** (personal use of all drugs decriminalised / cannabis only / no).
Each entry carries a one-line note that appears on hover and in the HERE
card, which shows all five statuses for the pinned country at once. Unlisted
countries take the layer default (cannabis and psychedelics: illegal;
alcohol, tobacco: legal; decrim: no). There is no keyless API for drug law,
so this is maintained by hand — the caption says so and tells you to verify
locally. Edit `substances.js` to update; no code changes needed.

## People sub-dials — Reading and Ballot

**Reading** — one floating label per country: its #1 Wikipedia article
yesterday, from Wikimedia's `top-per-country` pageviews API (keyless,
CORS-open, fetched directly by the browser). Label size scales with views
(three buckets); at globe zoom only the ~40 most-read countries show, more
appear as you zoom, and MapLibre collision keeps them from overlapping.
Fetching is lazy — only countries in view plus HERE, six at a time, HERE
first then by population — and cached in memory + localStorage per day.
Main pages, Special/maintenance namespaces (a dozen languages), non-Wikipedia
projects and footer-link artifacts are filtered before taking the top 10.
Click a country: the panel lists its top 10 with views and links, dated
"yesterday · UTC", plus a "Searching now" section from Google Trends via the
Worker's `/trends?geo=CC` route (15-min cache) — omitted silently if Google
refuses. Data realities: Wikimedia publishes nothing for privacy-protected
countries (Russia, Egypt, Iran… → 404, no label) and small countries' lists
are often only main/search pages, so ~40 labels at globe zoom is the ceiling.

**Ballot** — Wikidata SPARQL (all scheduled elections through 2027) via the
Worker's `/elections` route (24-h cache; rows deduped by item, classified
national / regional / by-election from type + label; ISO codes via `P297`).
Countries fill by days until their next *national* vote (red ≤30 d → orange
90 → yellow 180 → blue 365 → grey beyond); regional/by-election-only
countries get a light tint + dashed outline instead. A top-center pill cycles
the next three national votes every 6 s (`NEXT VOTE · Russia legislative ·
T−4d 12h`), click flies there; on election day the country pulses. The
panel lists a country's upcoming elections, every line linking to its
Wikidata item. Last good copy is kept in localStorage so the sub-dial
survives the Worker being down.

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
- **Immigration mode** — each country coloured by the dominant thing its
  immigration system is built to attract: skilled talent, investors & wealth,
  nomads & retirees, guest workers, diaspora & kin, open door, family &
  humanitarian, or largely closed (75 countries, curated in `passport-map.js`
  as `IMMIGRATION`, dated 2026-09). Each country carries a "who" and a "why".
  Dominant approach only — most countries run several routes, which the "who"
  line names.
- **Citizenship mode** — years of legal residence before you can apply for
  naturalisation by the standard route (~110 countries, curated in
  `passport-map.js` as `NATURALIZATION`, dated 2026-09). Buckets from ≤3 years
  (Argentina, Peru, Canada) to 20+ (UAE, Qatar) and "no practical route"
  (China); each country's note covers fast tracks and whether dual
  citizenship is allowed. Marriage, descent and investment routes are faster
  and not shown — the legend says so.
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

A **Hazards** button shows what has actually hit the region around the map
centre since 2016, drawn on the terrain and counted per year in a panel:
tropical-cyclone tracks coloured by peak wind and volcanic eruptions (NASA
EONET, read directly by the browser), earthquakes M5.5+ (USGS), and floods
(GDACS archive: baked into the static `relief/floods.json` by
`relief/build_floods.py`, with the Worker's `/floods?year=YYYY` route asked
only for the year(s) since the bake — crawling the whole archive per visit
meant ~40 parallel GDACS requests, which GDACS stalls on). Each source lands
in the panel on its own, so a slow feed never holds the others back; if the
Worker is down, floods still show and the footer says through which date.
Re-run the bake script about once a year. Each hazard gets a total, a per-year
rate, a bar per year, a last-12-months count and its latest event; marks from
the last 12 months are brighter; a tap names the event. Counting happens
inside an outlined box around the centre (a pitched 3D view has no honest
"on screen" rectangle), sized from the zoom and refreshed after each move.
Data notes: flood counts start in 2020 because GDACS logged ~100 floods a
year before 2019 and ~600 since 2021 (reporting, not weather); EONET ignores
`start` unless `end` is sent too; storm tracks are broken wherever a fix
implies >65 km/h movement, which removes mis-signed longitudes in the feed.
It is a record of past events, not a forecast, and the panel says so.

A **SEA bar** (right edge, 0–100 m) raises the ocean: a second `color-relief`
layer paints everything between 0 m and the chosen height flood-blue, so
drowned land follows the actual DEM contours live as you drag. Existing ocean
keeps the basemap's styling; only newly drowned land lights up. Works on all
three styles.

Three styles: **Dark** (monochrome sculpture), **Nature** — a light theme
using MapLibre's `color-relief` layer for hypsometric tinting (greens →
tans → browns → snow, plus blue bathymetry: terrarium tiles carry ocean
depth), with the page UI switching to light glass to match — and
**Satellite**: real Esri World Imagery draped over the terrain (built as a
raster style with the Carto vector boundary source grafted in, so the
Borders toggle works there too; no hillshade — imagery carries its own
shading).

Version note: relief pins maplibre-gl **5.7.0** (first with `color-relief`).
5.24.0 breaks terrain here (tile-bounds + shader errors) — do not bump
blindly; the main app remains on 5.6.0.

## vendor/ — datasets hosted on civ.fm

Country shapes, country facts and the visa matrix are served from `vendor/`
rather than from `raw.githubusercontent.com` / `cdn.jsdelivr.net`: some ISPs
and countries block those hosts, which left the passport page on "Data
unreachable — Failed to fetch" and every country choropleth blank. Sources,
licences and the refresh script are in `vendor/README.md`.

## Data sources (all keyless, CORS-open, fetched client-side)

Open-Meteo (forecast, air quality, flood/GloFAS) · USGS · NASA EONET ·
NASA GIBS Black Marble tiles · World Bank API · wheretheiss.at ·
open.er-api.com (FX) · world-countries (facts, in `vendor/`) ·
johan/world.geo.json (country shapes, in `vendor/`) · BigDataCloud reverse geocode ·
Radio Browser (station directory, direct) ·
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
