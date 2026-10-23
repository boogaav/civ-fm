# CIV FM — Earth Platform

A civilization dashboard for one human. The whole planet on a minimal 3D globe,
tuned like a radio — one frequency at a time, each channel answering a question
every citizen of Earth actually has.

Spec: https://claude.ai/code/artifact/5024b0e4-4ae7-4645-b146-7809fa48be20

## The dial — seven channels, Apple-style UI

Restructured 2026-10-19 so the dial reads the way a person zooms out from
themselves: the planet, the body, the home region, money, the state, the
mind, the future. Earlier merges: Air + Ground + Water → Earth (2026-09-22);
Grid, People, Place and Radio dissolved into Home, State and Mind
(2026-10-19). Old channel definitions (`signal`, `radio`) live on off-dial
and are delegated to by Mind.

| Freq  | Channel | Globe layer | HERE readouts |
|-------|---------|-------------|----------------|
| 88.0  | Earth   | Sub-dial: Air (live city temperatures + day/night) · Ground (USGS quakes, GDACS alerts, EONET events) · Water (water-stress choropleth) | Weather, AQI, UV · quake/disaster distance · soil moisture, river discharge |
| 91.0  | Body    | Sub-dial: Life (life expectancy) · Care (physicians per 1,000) · Cannabis · Alcohol · Tobacco · Psychedelics (what's legal where, curated) | Life expectancy, physicians, health spend · substance law card incl. decriminalisation |
| 93.0  | Home    | Sub-dial: Living (HDI) · Health · School · Income · Internet (Ookla) · Lights (NASA Black Marble) — 1,763 sub-national regions | Region name and rank, HDI, life expectancy, schooling, income, population, internet speed, national population / density / languages / capital · Lights: electricity and internet access |
| 98.0  | Money   | Sub-dial: GDP · Inflation · Gold reserves · Gov. debt · Income tax · Corporate tax | GDP, inflation, gold, debt, currency, live USD rate, taxes, regional income |
| 100.5 | State   | Sub-dial: System (political system, CIA Factbook) · Vote (days until each country votes, Wikidata) · Passport (where one passport can go, picker in the card) · Citizenship (years to naturalise, curated) · Immigration (who each country attracts, curated) | Government type, heads, legislature, suffrage, constitution + reader link · upcoming elections · visa counts and the rule for the HERE country · residence years, dual citizenship · approach, who, why |
| 103.0 | Mind    | Sub-dial: Faith (largest religion) · Reading (what each country read yesterday on Wikipedia) · Radio (stations streaming online, player) · Signal (live Wikipedia edits, ISS, next launch) | Religion breakdown · top-10 articles + Google Trends · station list with Popular/Rising/News switch · UTC, sun, edits/min, ISS, launch countdown |
| 106.5 | Future  | Sub-dial: Outlook · Climate zone · Crops · Warming — 4,595 regions under SSP5-8.5, 2026–2125, with a year bar | Local warming, net outlook, Köppen zone, climate twin, crops |

UI is macOS-style: system SF font stack, frosted-glass panels
(backdrop blur + hairlines), segmented-control dial, Apple system colors,
Maps-style blue location puck. Day/night terminator shows only on channels
where it means something (Air, Ground, Signal); data channels get full clarity.

## Home — the region, not the country average

`place/place.js` registers `CHANNELS.place` after `app.js` loads, like Future.

- **Data** — Global Data Lab's Subnational Human Development Database
  (globaldatalab.org/shdi), through the Open Numbers mirror
  (github.com/open-numbers/ddf--gdl--shdi, CC BY): 1,774 regions in 186
  countries, 1990 to 2019, with HDI, life expectancy, mean and expected
  years of schooling, GNI per person at PPP and population. GDL's own
  release reaches 2022 but needs a free account; `place/build_place.py`
  takes a directory of their CSVs and the region TopoJSON and writes
  `place/regions.json` (1.0 MB) and `place/data.json` (1.1 MB), fetched only
  when Place is tuned or another channel asks for a region hint.
- **Globe** — one GeoJSON source coloured through `setFeatureState`, so
  switching sub-dials never re-tiles. Hovering a region shows its value,
  year and ten-year change.
- **HERE** — point-in-polygon over the regions (bbox prefilter, ray cast)
  finds the region under the pin. The card ranks it among its country's
  regions, compares each number with the national level and shows the
  ten-year trend.
- **Region hints** — Body › Life, Money and People › Density call
  `placeHint()` to append one "here" line with the regional value against
  the national one and a link into Place.
- **Internet** (`place/build_internet.py`, `internet.json`) — measured
  download speed per region from Ookla Open Data Speedtest tiles
  (CC BY-NC-SA 4.0), tests-weighted, fixed and mobile, latest quarter.

## Trends — ten years on every World Bank readout

`wb(code)` now loads the full series since 2005 (`WB_FROM`), not just the
latest value: `{ISO3: {value, year, s: [[year, value], …]}}`. `trend(rec,
{pts, better, label, digits})` renders a sparkline, an arrow and the change
against the value ten years before the latest one (points for rates and
years, percent otherwise; green or red when `better` says which way is
good). Choropleth hover popups carry the same change.

The World Bank API answers in 0.2 s one minute and over a minute the next,
so the series go through the Worker (`/wb/<indicator>`, compacted, 12 h edge
cache) and are kept for 24 h in `localStorage`. A failed indicator leaves
"—" readouts and a "Weak signal" status instead of blanking the channel.

## State › System, Mind › Faith, and /civic/constitution

`civic/build_civic.py` bakes `civic/civic.json` (412 KB) from the CIA
World Factbook (public domain, via github.com/factbook/factbook.json, one
file per country matched by name) and the Constitute Project's list of
constitutions in force, and copies each constitution's English HTML into
`civic/constitutions/<ISO3>.html` (188 texts, 42 MB) so they load on
networks that block third parties.

- **State** colours countries by political system, classified from the
  Factbook's government type (parliamentary / semi-presidential /
  presidential republic, constitutional / absolute monarchy, one-party
  state, theocracy, military or transitional, dependency). The card: heads
  of state and government, how leaders are chosen, legislature, suffrage,
  constitution history and amendment rule, independence, national day, and
  a link to the full text.
- **Faith** colours countries by their largest religion family. The
  Factbook's free-text "Religions" line is parsed into shares; families are
  Christian, Muslim, Hindu, Buddhist, Jewish, folk and traditional,
  unaffiliated, other. Without percentages the first-listed religion wins.
- **/civic/constitution/?c=ISO3** is the reader: the text with a contents
  list from its headings, a find box that filters paragraphs, the political
  facts beside it, and links to Constitute. Licence CC BY-NC 3.0, credited
  on the page.
- Re-bake after a Factbook update: download the tarball
  (`gh api repos/factbook/factbook.json/tarball`), the Constitute list
  (`/service/constitutions?lang=en`) and each in-force `/service/html?cons_id=`,
  then run the script with both directories.

## State › Parties — who sits in parliament

`civic/build_parties.py <factbook dir> <wdparties dir> <hog.csv>` writes
`civic/parties.json` (lower or single house per country: name, total
seats, election date, parties with seats and share, logo flag, colour,
"leads") and fills `civic/logos/<QID>.png` (96 px thumbnails from Commons).
Seats come from the Factbook's "parties elected and seats per party" where
it exists, else from the lower house's English Wikipedia infobox
(`political_groups1`, parsed with template-depth tracking; bold lines are
bloc headers; the indent level whose seats add up closest to the house size
wins; the UK's list lives in a template with one branch per house). Logos,
colours and abbreviations come from one Wikidata SPARQL per country
(`dl/wdparties/<ISO3>.csv`), matched by normalised name, alias or
abbreviation. "Leads government" is the head of government's party
(Wikidata P6 → P102), accepted when the person's surname appears in the
Factbook's head-of-government line, or by abbreviation inside a group name
(CDU in CDU/CSU). The map colours countries by the largest party's seat
share. Shares are of the house, not of cabinet posts.

## State › Power — who holds it, and for how long

`civic/build_power.py [ISO3 …]` writes `civic/power/<ISO3>.json` (up to
100 people) and `civic/power/index.json` (the leader and years in office,
for the map). Two Wikidata queries per country: living people holding a
position whose jurisdiction or country is this one (P39 with no end time,
no date of death, with start time and the English Wikipedia title), and
citizens with a declared net worth (P2218). Positions are tiered by regex
(`make_tiers`): head of state and head of government must name the country
itself, then vice/deputy, speakers, key ministers, top courts, central
bank, military chiefs, other ministers, party leaders, regional leaders,
mayors, religious leaders, legislators, ambassadors; jury presidents,
university presidents and the like are excluded. Score = tier weight +
prominence (log of sitelinks) − 12 if the start date is unknown; billionaires
score 45 + log of net worth. The leader for the map is the head of
government in parliamentary systems and constitutional monarchies, the
head of state elsewhere. Wikidata is volunteer-edited: stale entries keep a
former holder on the list, and the card says so.

## /civic — the constitution hub

`civic/index.html` is the landing page for everything constitutional:
stats from `atlas/atlas.json`, a country lookup (names, codes, native
names and aliases; opens on the visitor's country via `/whereami`, or
`#ISO3`), and per country: constitution facts, political system
(`civic.json`), family (atlas), the constitutional brother (cosine of
topic sets weighted by rarity, ln(N/n) per topic, so shared rare
guarantees count most), five runners-up, the closest constitution by
wording and the countries it shares passages with (atlas `cos`/`sh`
pair arrays), a copy-ready reply line, PDF download, and deep links into
the reader, compare, atlas, card and the globe. Tiles lead to each tool;
the shared-ground and rarest-guarantee strips and the 14 families link
onward. The globe accepts `?ch=<channel>&sub=<sub>&c=<ISO3>` to open on a
channel, sub-section and country (`style.load` in app.js).

## /civic/compare — what unites constitutions

`civic/build_compare.py <constitute dir>` reads the raw Constitute HTML
(the `data-topics` tags on every section, 387 topics in 12 groups from
their ontology) and writes `civic/compare.json`: topic shares across the
186 constitutions in force, each constitution's topic set, up to three
section ids per topic and constitution (for quotes), and a 2-D layout from
classical multidimensional scaling of Jaccard distance (pure Python power
iteration, no numpy). The page: ranked topic bars with group filter and
search; a topic panel with the 186-tile coverage grid, clauses fetched
live from `civic/constitutions/<ISO3>.html` by section id, and sibling
topics in the same group; the similarity map (SVG scatter, colour by
region, size by topic count) with nearest constitutions, common topics a
constitution leaves out, and rare ones it includes. Linked from State ›
System and from the reader header. A MapLibre globe ("On the globe",
same Carto style as the main page, `vendor/countries.geo.json` as the
fill source) shades every country by Jaccard similarity to the chosen
constitution, or by has/has-not when only a topic is chosen; clicking a
country selects it.

## /card — country card generator

`card/` is a standalone page (no MapLibre): pick a country, get one image
with its outline and the twelve national metrics the globe knows, drawn on
a canvas you can download, copy or share. Formats: Square 1080×1080
(Instagram post), Story 1080×1920, Wide 1600×900 (X). `#ISO3` in the URL
deep-links a country.

- **Metrics**: population, density, life expectancy, HDI (GDL national),
  GDP per person PPP, inflation, government debt, internet use,
  electricity access, water stress, top income + corporate tax (curated),
  passport reach (visa-free or on-arrival destinations from the Passport
  Index CSV in `vendor/`). World Bank cells carry the ten-year sparkline
  and change, same rule as the globe.
- **Outline**: `vendor/countries.geo.json`, fitted to a box with an
  equirectangular projection scaled by cos(latitude); countries across the
  antimeridian are unwrapped first so Russia, Fiji and the USA draw whole.
  Countries without a shape (microstates) get the text "No outline".
- **Sharing**: Web Share API with the PNG as a file where supported
  (phones: the sheet lists Instagram and X), else download. "Copy image"
  uses the async clipboard. "Post on X" opens the intent with the caption;
  X's web intent cannot attach images, so the page says to attach it.
- **Default country**: the URL hash if present; otherwise the Worker's
  `/whereami` route answers with the visitor's country from Cloudflare's
  edge (`request.cf.country`, nothing stored, `no-store`), and the page
  says "X is where you seem to be"; the browser's locale region is the
  fallback while that answers.
- Data comes through the same Worker `/wb/` route and `localStorage` cache
  as the globe, plus `place/data.json` for HDI.

## Tuning knob

A mechanical knob sits to the right of the dial. Scrolling over it, dragging
it round, the arrow keys when it has focus, or a plain click move the dial
one station per detent (360° / 7); `knobSync()` turns the mark the short
way round whenever something else tunes the globe (dial buttons, pills).
Pointer capture makes the drag work on touch screens.

## Hide any panel

Every floating panel (HERE, legend, ticker, year bar, alert and election
pills) carries a small × that hides it for the session; the status line
then shows "Show hidden (n)" to bring them all back. The × on the pills is
a sibling button positioned beside them (`placeHideX`), since the pills are
buttons themselves. `legend()` re-attaches its × after each rebuild. A new
HERE point un-hides the HERE panel on its own. Hover popups on the map
close by themselves and need no button.

## Explanations — what each section means

`explain.js` holds one entry per channel and per sub-dial (`EXPLAIN`, keyed
`"money"` or `"money/inflation"`): what the colours mean, then the data source
and how fresh it is. Hovering or keyboard-focusing a dial or sub-dial button
shows it as a card. Touch screens have no hover, so an **i** button beside the
frequency shows the card for whatever is tuned. **A new channel or sub-dial
needs an entry here**, or it gets no card.

## Idle spin

The globe turns by default at 2° per second. A touch, drag, scroll or fly-to
pauses it and it resumes after 6 idle seconds. It only turns while zoomed out
(full speed below zoom 2, easing to a stop by 3.2), so a place being studied
stays put. The **Spin** button beside Borders turns it off; the choice is kept
in `localStorage` (`civfm-spin`). With "reduce motion" set in the OS it starts
off.

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

## Mind › Signal — the live nervous system

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

## Mind › Radio — what is on the air

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

## Mind › Reading and State › Vote

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

## State › Passport, Citizenship, Immigration on the globe

Since 2026-10-19 the three Passport-page modes also run on the main globe
as State sub-dials. `passport-data.js` holds what both share: visa
categories and colours (`CATS`, `OPEN_CATS`), the curated `NATURALIZATION`
and `IMMIGRATION` tables, `CIT_BUCKETS` and `classify()`; it loads before
`passport-map.js` on the Passport page and before `app.js` on the globe.
The globe parses the same `vendor/passport-index-tidy-iso3.csv` once
(`loadVisa`). The passport being drawn is chosen in the card, else the HERE
country, else the visitor's country from `/whereami`. `addPaintedChoro`
draws features that carry their own colour and hover text.

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
Global Data Lab subnational HDI (in `place/`) · Ookla Open Data (in `place/`) ·
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
