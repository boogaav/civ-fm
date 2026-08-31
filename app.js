/* CIV FM v0.3 — all eight channels + GDACS multi-hazard alerts */

const PROXY = "https://civfm-proxy.boogaav.workers.dev";

const $ = (s) => document.querySelector(s);
const statusEl = $("#status-text");
const setStatus = (html) => (statusEl.innerHTML = html);
const LIVE = '<span class="live">●</span> Live';

const state = {
  channel: null,
  here: null, // {lat, lng, label, country}
  interacted: false,
  timers: {},
  cache: { wb: {} },
};

/* ---------------- map ---------------- */

const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
  center: [10, 20],
  zoom: 1.6,
  attributionControl: { compact: true },
});

new ResizeObserver(() => map.resize()).observe(document.getElementById("map"));

map.on("style.load", () => {
  map.setProjection({ type: "globe" });
  addTerminator();
  tune("air");
  setStatus(LIVE);
});

["pointerdown", "wheel"].forEach((ev) =>
  map.getCanvas().addEventListener(ev, () => (state.interacted = true), { once: true })
);

// gentle idle rotation until first touch
(function spin() {
  if (!state.interacted && map.loaded()) {
    map.setCenter([map.getCenter().lng + 0.02, map.getCenter().lat]);
  }
  requestAnimationFrame(spin);
})();

/* ---------------- solar / terminator ---------------- */

function subsolarPoint(date) {
  const rad = Math.PI / 180;
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const L = (280.46 + 0.9856474 * d) % 360;
  const g = ((357.528 + 0.9856003 * d) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * d) * rad;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda)) / rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / rad;
  const gmst = (280.46061837 + 360.98564736629 * d) % 360;
  let lng = ((ra - gmst) % 360 + 540) % 360 - 180;
  return { lat: decl, lng };
}

function nightPolygon() {
  const sun = subsolarPoint(new Date());
  const rad = Math.PI / 180;
  const pts = [];
  for (let lng = -180; lng <= 180; lng += 2) {
    const H = (lng - sun.lng) * rad;
    const lat = Math.atan(-Math.cos(H) / Math.tan(sun.lat * rad)) / rad;
    pts.push([lng, lat]);
  }
  const pole = sun.lat > 0 ? -90 : 90;
  pts.push([180, pole], [-180, pole], pts[0]);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
}

function addTerminator() {
  map.addSource("terminator", { type: "geojson", data: nightPolygon() });
  map.addLayer({
    id: "terminator-fill",
    type: "fill",
    source: "terminator",
    paint: { "fill-color": "#000000", "fill-opacity": 0.4 },
  });
  state.timers.terminator = setInterval(() => {
    const src = map.getSource("terminator");
    if (src) src.setData(nightPolygon());
  }, 60000);
}

/* ---------------- utils ---------------- */

function haversine(a, b) {
  const rad = Math.PI / 180;
  const R = 6371;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const WMO = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "rime fog", 51: "drizzle", 53: "drizzle", 55: "drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "showers", 81: "showers", 82: "violent showers",
  85: "snow showers", 86: "snow showers", 95: "thunderstorm", 96: "thunderstorm", 99: "hail storm",
};

const aqiClass = (aqi) =>
  aqi == null ? "" : aqi <= 50 ? "good" : aqi <= 100 ? "warn" : "bad";

async function getJSON(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const fmtTime = (s) => (s ? s.slice(11, 16) : "—");

function fmtBig(n) {
  if (n == null) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "k";
  return String(Math.round(n));
}

/* ---------------- data loaders (cached with TTLs) ---------------- */

// live feeds expire so the map stays current without a reload
const TTL = { quakes: 120e3, gdacs: 300e3, eonet: 900e3, cityTemps: 600e3 };

async function cached(key, loader) {
  const e = state.cache[key];
  if (e && e.t && Date.now() - e.t < (TTL[key] ?? Infinity)) return e.v;
  const v = await loader();
  state.cache[key] = { t: Date.now(), v };
  return v;
}

async function loadCityTemps() {
  return cached("cityTemps", loadCityTempsFresh);
}

async function loadCityTempsFresh() {
  const lats = CITIES.map((c) => c[1]).join(",");
  const lngs = CITIES.map((c) => c[2]).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m&timezone=UTC`;
  const data = await getJSON(url);
  const arr = Array.isArray(data) ? data : [data];
  const features = arr.map((d, i) => ({
    type: "Feature",
    properties: { name: CITIES[i][0], temp: d.current?.temperature_2m },
    geometry: { type: "Point", coordinates: [CITIES[i][2], CITIES[i][1]] },
  }));
  return { type: "FeatureCollection", features };
}

async function loadQuakes() {
  return cached("quakes", () =>
    getJSON("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson")
  );
}

// GDACS multi-hazard alerts (floods, cyclones, droughts, quakes, fires)
// via the civfm-proxy Worker — gdacs.org itself blocks browser CORS.
const GDACS_TYPES = { EQ: "Earthquake", FL: "Flood", TC: "Cyclone", DR: "Drought", WF: "Wildfire", VO: "Volcano", TS: "Tsunami" };

async function loadGdacs() {
  return cached("gdacs", async () => {
    const raw = await getJSON(`${PROXY}/gdacs`, 20000);
    const byEvent = new Map();
    for (const f of raw.features || []) {
      if (!String(f.id || "").includes("Centroid")) continue;
      const p = f.properties;
      if (byEvent.has(p.eventid)) continue; // first episode per event = latest
      byEvent.set(p.eventid, {
        type: "Feature",
        properties: {
          name: p.name,
          level: p.alertlevel, // Green | Orange | Red
          etype: GDACS_TYPES[p.eventtype] || p.eventtype,
          country: p.country || "",
          from: p.fromdate || "",
          to: p.todate || "",
          ts: Date.parse(p.todate || p.fromdate || "") || 0,
        },
        geometry: f.geometry,
      });
    }
    return { type: "FeatureCollection", features: [...byEvent.values()] };
  });
}

const EONET_COLORS = {
  wildfires: "#ff453a",
  severeStorms: "#64d2ff",
  volcanoes: "#ff9f0a",
  seaLakeIce: "#98989d",
  earthquakes: "#bf5af2",
};

async function loadEonet() {
  return cached("eonet", loadEonetFresh);
}

async function loadEonetFresh() {
  const data = await getJSON("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=400");
  const features = [];
  for (const ev of data.events || []) {
    const cat = ev.categories?.[0]?.id || "other";
    const g = ev.geometry?.[ev.geometry.length - 1];
    if (!g) continue;
    let coords = null;
    if (g.type === "Point") coords = g.coordinates;
    else if (g.type === "Polygon") coords = g.coordinates?.[0]?.[0];
    if (!coords || coords.length < 2) continue;
    features.push({
      type: "Feature",
      properties: {
        title: ev.title, cat,
        color: EONET_COLORS[cat] || "#98989d",
        date: (g.date || "").slice(0, 10),
      },
      geometry: { type: "Point", coordinates: [coords[0], coords[1]] },
    });
  }
  return { type: "FeatureCollection", features };
}

async function loadNews() {
  if (state.cache.news) return state.cache.news;
  const data = await getJSON(
    "https://api.gdeltproject.org/api/v2/geo/geo?query=world&format=geojson&timespan=60min&maxpoints=300"
  );
  const features = (data.features || []).filter((f) => f.geometry?.type === "Point");
  state.cache.news = { type: "FeatureCollection", features };
  return state.cache.news;
}

// country polygons, id = ISO alpha-3
async function loadCountryShapes() {
  if (state.cache.shapes) return state.cache.shapes;
  state.cache.shapes = await getJSON(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json",
    20000
  );
  return state.cache.shapes;
}

// country facts (world-countries dataset via jsDelivr — restcountries.com blocks CORS)
async function loadFacts() {
  if (state.cache.facts) return state.cache.facts;
  const rows = await getJSON(
    "https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json",
    20000
  );
  const by3 = {}, by2 = {};
  for (const r of rows) { by3[r.cca3] = r; by2[r.cca2] = r; }
  state.cache.facts = { by3, by2 };
  return state.cache.facts;
}

// World Bank indicator → {ISO3: {value, year}}
async function wb(code) {
  if (state.cache.wb[code]) return state.cache.wb[code];
  const data = await getJSON(
    `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=500&mrnev=1`,
    20000
  );
  const out = {};
  for (const r of data[1] || []) {
    if (r.countryiso3code && r.value != null)
      out[r.countryiso3code] = { value: r.value, year: r.date };
  }
  state.cache.wb[code] = out;
  return out;
}

/* ---------------- choropleth engine ---------------- */

function removeChoro() {
  if (map.getLayer("choro")) map.removeLayer("choro");
  if (map.getSource("choro")) map.removeSource("choro");
}

async function addChoropleth({ values, ramp, fmt, opacity = 0.55, input }) {
  removeChoro();
  const shapes = await loadCountryShapes();
  const features = [];
  for (const f of shapes.features) {
    const rec = values[f.id];
    if (!rec) continue;
    features.push({
      ...f,
      properties: { ...f.properties, value: rec.value, year: rec.year || "" },
    });
  }
  map.addSource("choro", { type: "geojson", data: { type: "FeatureCollection", features } });
  const stops = ramp.flatMap(([v, c]) => [v, c]);
  map.addLayer(
    {
      id: "choro",
      type: "fill",
      source: "choro",
      paint: {
        "fill-color": ["interpolate", ["linear"], input || ["get", "value"], ...stops],
        "fill-opacity": opacity,
      },
    },
    "terminator-fill"
  );
  state.choroFmt = fmt;
  if (!state.choroHoverBound) {
    state.choroHoverBound = true;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    map.on("mousemove", "choro", (e) => {
      const p = e.features[0].properties;
      popup
        .setLngLat(e.lngLat)
        .setHTML(`<b>${p.name}</b><br>${state.choroFmt(p.value)}${p.year ? ` <span style="color:#98989d">(${p.year})</span>` : ""}`)
        .addTo(map);
    });
    map.on("mouseleave", "choro", () => popup.remove());
  }
}

const gradientCSS = (ramp) => ramp.map(([, c]) => c).join(",");

/* ---------------- HERE ---------------- */

let herePin = null;

async function setHere(lat, lng, viaGeolocate) {
  state.here = { lat, lng, label: `${lat.toFixed(2)}, ${lng.toFixed(2)}`, country: null };
  $("#here-hint").classList.add("hidden");
  $("#here-body").classList.remove("hidden");
  $("#here-place").textContent = state.here.label;

  if (!herePin) {
    const el = document.createElement("div");
    el.className = "here-pin";
    herePin = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
  } else {
    herePin.setLngLat([lng, lat]);
  }
  if (viaGeolocate) map.flyTo({ center: [lng, lat], zoom: 4, duration: 2500 });

  renderHere();

  // reverse-geocode + country facts (keyless, CORS-friendly), then re-render
  try {
    const g = await getJSON(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    const label = [g.city || g.locality, g.countryName].filter(Boolean).join(", ");
    if (label) {
      state.here.label = label;
      $("#here-place").textContent = label;
    }
    if (g.countryCode) {
      const facts = await loadFacts();
      state.here.country = facts.by2[g.countryCode] || null;
    }
    renderHere();
  } catch (e) {}
}

// clicking point features opens popups; anywhere else sets HERE
const CLICK_GUARD = ["air-cities", "quakes", "eonet", "gdacs", "news"];

map.on("click", (e) => {
  const hits = map.queryRenderedFeatures(e.point, {
    layers: CLICK_GUARD.filter((id) => map.getLayer(id)),
  });
  if (hits.length) return;
  setHere(e.lngLat.lat, ((e.lngLat.lng + 540) % 360) - 180);
});

$("#btn-locate").addEventListener("click", () => {
  if (!navigator.geolocation) return setStatus("Geolocation unavailable");
  setStatus("Locating…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.interacted = true;
      setHere(pos.coords.latitude, pos.coords.longitude, true);
      setStatus(LIVE);
    },
    () => setStatus("Location denied — click the globe instead"),
    { timeout: 8000 }
  );
});

function renderHere() {
  if (!state.here || !state.channel) return;
  CHANNELS[state.channel].here($("#here-body"));
}

/* ---------------- channel plumbing ---------------- */

const LAYER_IDS = ["choro", "grid-lights", "air-cities", "eonet", "gdacs-glow", "gdacs", "quakes-glow", "quakes", "news"];
const SOURCE_IDS = ["choro", "grid-lights", "air-cities", "quakes", "eonet", "gdacs", "news"];

function clearChannelLayers() {
  for (const id of LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of SOURCE_IDS) if (map.getSource(id)) map.removeSource(id);
  if (state.timers.iss) { clearInterval(state.timers.iss); state.timers.iss = null; }
  if (issMarker) { issMarker.remove(); issMarker = null; }
}

function legend(title, rows) {
  $("#legend").innerHTML =
    `<div class="lg-title">${title}</div>` +
    rows
      .map((r) =>
        r.gradient
          ? `<div class="lg-row"><div class="bar" style="background:linear-gradient(90deg,${r.gradient})"></div></div><div class="lg-row" style="justify-content:space-between"><span>${r.from}</span><span style="margin-left:auto">${r.to}</span></div>`
          : `<div class="lg-row"><span class="dot" style="background:${r.color}"></span><span>${r.label}</span></div>`
      )
      .join("");
}

function ro(k, val, cls = "", sub = "", wide = false) {
  return `<div class="ro${wide ? " wide" : ""}"><span class="k">${k}</span><span class="val ${cls}">${val}</span>${sub ? `<span class="sub">${sub}</span>` : ""}</div>`;
}

const tuningHTML = `<div class="readouts">${'<div class="ro wide"><span class="k">Tuning…</span></div>'}</div>`;

function needCountry(el) {
  if (state.here.country) return false;
  el.innerHTML = `<div class="here-hint">No country at this point — set HERE on land for national readouts.</div>`;
  return true;
}

const boundHovers = new Set();

function popupOnHover(layerId, html) {
  if (boundHovers.has(layerId)) return;
  boundHovers.add(layerId);
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
  map.on("mouseenter", layerId, (e) => {
    map.getCanvas().style.cursor = "pointer";
    popup.setLngLat(e.features[0].geometry.coordinates).setHTML(html(e.features[0].properties)).addTo(map);
  });
  map.on("mouseleave", layerId, () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });
}

const wbHere = (code) => {
  const c3 = state.here.country?.cca3;
  return c3 ? state.cache.wb[code]?.[c3] : null;
};

/* ---------------- channels ---------------- */

let issMarker = null;

const RAMPS = {
  money: [[1000, "#1b2b40"], [5000, "#14456f"], [15000, "#0a84ff"], [40000, "#4da3ff"], [90000, "#9ecfff"]],
  inflation: [[0, "#30d158"], [4, "#ffd60a"], [10, "#ff9f0a"], [25, "#ff453a"]],
  gold: [[7, "#2a251a"], [9, "#57491d"], [10.5, "#a8871f"], [12, "#ffd60a"]], // log10 USD
  debt: [[20, "#30d158"], [50, "#ffd60a"], [80, "#ff9f0a"], [130, "#ff453a"]],
  body: [[55, "#ff453a"], [65, "#ff9f0a"], [73, "#ffd60a"], [80, "#30d158"], [86, "#6ae58a"]],
  water: [[0, "#30d158"], [25, "#ffd60a"], [50, "#ff9f0a"], [100, "#ff453a"]],
  people: [[2, "#231a33"], [25, "#4a2d73"], [100, "#7d4dbb"], [400, "#bf5af2"], [2000, "#e0a9ff"]],
};

const CHANNELS = {
  air: {
    num: "88.0", name: "Air",
    q: "Can I breathe, and what is the sky about to do to me?",
    async activate() {
      const fc = await loadCityTemps();
      map.addSource("air-cities", { type: "geojson", data: fc });
      map.addLayer({
        id: "air-cities",
        type: "circle",
        source: "air-cities",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 4, 5, 9],
          "circle-opacity": 0.85,
          "circle-color": [
            "interpolate", ["linear"], ["coalesce", ["get", "temp"], 0],
            -30, "#5ac8fa", -10, "#64d2ff", 0, "#8ee8ff",
            10, "#30d158", 20, "#ffd60a", 30, "#ff9f0a", 40, "#ff453a",
          ],
        },
      });
      popupOnHover("air-cities", (p) => `<b>${p.name}</b><br>${p.temp}°C`);
      legend("Air — temperature now", [
        { gradient: "#5ac8fa,#8ee8ff,#30d158,#ffd60a,#ff453a", from: "−30°C", to: "40°C" },
      ]);
    },
    async here(el) {
      const { lat, lng } = state.here;
      el.innerHTML = tuningHTML;
      try {
        const [wx, aq] = await Promise.all([
          getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto&forecast_days=2`),
          getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5&timezone=auto`).catch(() => null),
        ]);
        const c = wx.current;
        const aqi = aq?.current?.us_aqi;
        el.innerHTML =
          `<div class="readouts">` +
          ro("Temperature", `${Math.round(c.temperature_2m)}°`, "", `feels ${Math.round(c.apparent_temperature)}° · ${WMO[c.weather_code] || ""}`) +
          ro("Air quality", aqi ?? "—", aqiClass(aqi), aq?.current?.pm2_5 != null ? `AQI · PM2.5 ${aq.current.pm2_5}` : "") +
          ro("UV index", c.uv_index ?? "—", c.uv_index >= 6 ? "bad" : c.uv_index >= 3 ? "warn" : "good") +
          ro("Wind", `${Math.round(c.wind_speed_10m)} <small>km/h</small>`) +
          ro("Sun", `${fmtTime(wx.daily.sunrise[0])} – ${fmtTime(wx.daily.sunset[0])}`, "", "", true) +
          `<div class="ro wide"><span class="spark-label">Next 24 hours</span><canvas id="spark"></canvas></div>` +
          `</div>`;
        drawSpark(wx.hourly.temperature_2m.slice(0, 25));
      } catch (err) {
        el.innerHTML = `<div class="here-hint">Air data unreachable right now.</div>`;
      }
    },
  },

  ground: {
    num: "90.5", name: "Ground",
    q: "Is the earth under my feet safe today?",
    async activate() {
      const [quakes, eonet, gdacs] = await Promise.all([
        loadQuakes(),
        loadEonet(),
        loadGdacs().catch(() => null),
      ]);
      map.addSource("quakes", { type: "geojson", data: quakes });
      map.addSource("eonet", { type: "geojson", data: eonet });
      if (gdacs) {
        map.addSource("gdacs", { type: "geojson", data: gdacs });
        map.addLayer({
          id: "gdacs-glow", type: "circle", source: "gdacs",
          filter: ["!=", ["get", "level"], "Green"],
          paint: {
            "circle-radius": ["match", ["get", "level"], "Red", 30, 20],
            "circle-color": ["match", ["get", "level"], "Red", "#ff453a", "#ff9f0a"],
            "circle-opacity": 0.22, "circle-blur": 0.7,
          },
        });
        map.addLayer({
          id: "gdacs", type: "circle", source: "gdacs",
          paint: {
            "circle-radius": ["match", ["get", "level"], "Red", 7, "Orange", 6, 3],
            "circle-color": ["match", ["get", "level"], "Red", "#ff453a", "Orange", "#ff9f0a", "#8e8e93"],
            "circle-opacity": ["match", ["get", "level"], "Green", 0.5, 0.95],
            "circle-stroke-width": ["match", ["get", "level"], "Green", 0, 1.5],
            "circle-stroke-color": "#ffffff",
          },
        });
        popupOnHover("gdacs", (p) => `<b>${p.name}</b><br>${p.level} alert · ${p.country}<br>${p.from.slice(0, 11)} → ${p.to.slice(0, 11)}`);
      }
      map.addLayer({
        id: "eonet", type: "circle", source: "eonet",
        paint: { "circle-radius": 4, "circle-color": ["get", "color"], "circle-opacity": 0.8 },
      });
      map.addLayer({
        id: "quakes-glow", type: "circle", source: "quakes",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "mag"], 2.5, 8, 7, 40],
          "circle-color": "#ff453a", "circle-opacity": 0.16, "circle-blur": 0.6,
        },
      });
      map.addLayer({
        id: "quakes", type: "circle", source: "quakes",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "mag"], 2.5, 3, 7, 14],
          "circle-color": ["interpolate", ["linear"], ["get", "mag"], 2.5, "#ff9f0a", 5, "#ff6b3a", 7, "#ff453a"],
          "circle-opacity": 0.9,
        },
      });
      popupOnHover("quakes", (p) => `<b>M ${p.mag}</b><br>${p.place}`);
      popupOnHover("eonet", (p) => `<b>${p.cat}</b><br>${p.title}<br>${p.date}`);
      legend("Ground — live events", [
        { color: "#ff453a", label: "Red alert (GDACS) · quakes" },
        { color: "#ff9f0a", label: "Orange alert · volcanoes" },
        { color: "#8e8e93", label: "Minor alerts (GDACS)" },
        { color: "#64d2ff", label: "Severe storms (EONET)" },
      ]);
    },
    async here(el) {
      try {
        const [quakes, eonet, gdacs] = await Promise.all([
          loadQuakes(), loadEonet(), loadGdacs().catch(() => null),
        ]);
        const me = state.here;
        let alert = null;
        if (gdacs) {
          for (const f of gdacs.features) {
            if (f.properties.level === "Green") continue;
            const d = haversine(me, { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
            if (!alert || d < alert.d) alert = { d, f };
          }
        }
        let nearest = null;
        for (const f of quakes.features) {
          const d = haversine(me, { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
          if (!nearest || d < nearest.d) nearest = { d, f };
        }
        const within = quakes.features.filter((f) =>
          haversine(me, { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }) < 500
        ).length;
        let nearEv = null;
        for (const f of eonet.features) {
          const d = haversine(me, { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
          if (!nearEv || d < nearEv.d) nearEv = { d, f };
        }
        el.innerHTML =
          `<div class="readouts">` +
          ro("Quakes nearby", within, within ? "warn" : "good", "within 500 km · 24 h") +
          ro("Nearest quake", nearest ? `M${nearest.f.properties.mag}` : "—", "", nearest ? `${Math.round(nearest.d)} km away` : "") +
          ro("Nearest alert", alert ? alert.f.properties.etype : "None",
             alert ? (alert.d < 500 ? "bad" : "warn") : "good",
             alert ? `${alert.f.properties.level} · ${alert.f.properties.country.slice(0, 28)} · ${Math.round(alert.d)} km` : "no Orange/Red alerts (GDACS)", true) +
          ro("Nearest event", nearEv ? nearEv.f.properties.cat : "—", nearEv && nearEv.d < 300 ? "warn" : "", nearEv ? `${nearEv.f.properties.title.slice(0, 42)} · ${Math.round(nearEv.d)} km` : "", true) +
          `</div>`;
      } catch (err) {
        el.innerHTML = `<div class="here-hint">Ground data unreachable right now.</div>`;
      }
    },
  },

  water: {
    num: "93.0", name: "Water",
    q: "Can I drink, and will there be food?",
    async activate() {
      const stress = await wb("ER.H2O.FWST.ZS");
      await addChoropleth({
        values: stress,
        ramp: RAMPS.water,
        fmt: (v) => `Water stress ${Math.round(v)}%`,
        opacity: 0.5,
      });
      legend("Water — freshwater stress", [
        { gradient: gradientCSS(RAMPS.water), from: "Low", to: "Critical" },
        { color: "transparent", label: "Withdrawal vs. renewable supply (UN SDG 6.4.2)" },
      ]);
    },
    async here(el) {
      el.innerHTML = tuningHTML;
      const { lat, lng } = state.here;
      try {
        const [soil, flood] = await Promise.all([
          getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=soil_moisture_0_to_1cm&daily=precipitation_sum&timezone=auto&forecast_days=1`).catch(() => null),
          getJSON(`https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lng}&daily=river_discharge&forecast_days=1`).catch(() => null),
        ]);
        const stress = wbHere("ER.H2O.FWST.ZS");
        const sm = soil?.hourly?.soil_moisture_0_to_1cm?.[0];
        const rd = flood?.daily?.river_discharge?.[0];
        el.innerHTML =
          `<div class="readouts">` +
          ro("Water stress", stress ? `${Math.round(stress.value)}<small>%</small>` : "—",
             stress ? (stress.value < 25 ? "good" : stress.value < 50 ? "warn" : "bad") : "",
             stress ? `national · ${stress.year}` : "") +
          ro("Soil moisture", sm != null ? sm.toFixed(2) : "—", "", "m³/m³ · topsoil") +
          ro("River discharge", rd != null ? `${Math.round(rd)} <small>m³/s</small>` : "—", "", "nearest river cell (GloFAS)") +
          ro("Rain today", soil?.daily?.precipitation_sum?.[0] != null ? `${soil.daily.precipitation_sum[0]} <small>mm</small>` : "—") +
          `</div>`;
      } catch (err) {
        el.innerHTML = `<div class="here-hint">Water data unreachable right now.</div>`;
      }
    },
  },

  body: {
    num: "95.5", name: "Body",
    q: "Will this place keep me healthy?",
    async activate() {
      const [life] = await Promise.all([
        wb("SP.DYN.LE00.IN"), wb("SH.MED.PHYS.ZS"), wb("SH.XPD.CHEX.GD.ZS"),
      ]);
      await addChoropleth({
        values: life,
        ramp: RAMPS.body,
        fmt: (v) => `Life expectancy ${v.toFixed(1)} yrs`,
      });
      legend("Body — life expectancy", [
        { gradient: gradientCSS(RAMPS.body), from: "55 yrs", to: "86 yrs" },
      ]);
    },
    async here(el) {
      if (needCountry(el)) return;
      const life = wbHere("SP.DYN.LE00.IN");
      const phys = wbHere("SH.MED.PHYS.ZS");
      const spend = wbHere("SH.XPD.CHEX.GD.ZS");
      el.innerHTML =
        `<div class="readouts">` +
        ro("Life expectancy", life ? `${life.value.toFixed(1)} <small>yrs</small>` : "—",
           life ? (life.value >= 78 ? "good" : life.value >= 68 ? "warn" : "bad") : "",
           life ? `${state.here.country.name.common} · ${life.year}` : "") +
        ro("Physicians", phys ? phys.value.toFixed(1) : "—", "", "per 1,000 people") +
        ro("Health spend", spend ? `${spend.value.toFixed(1)}<small>%</small>` : "—", "", "of GDP", true) +
        `</div>`;
    },
  },

  grid: {
    num: "98.0", name: "Grid",
    q: "Do the lights turn on and does the internet work?",
    async activate() {
      map.addSource("grid-lights", {
        type: "raster",
        tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png"],
        tileSize: 256,
        maxzoom: 8,
        attribution: "NASA GIBS · Black Marble",
      });
      map.addLayer({
        id: "grid-lights", type: "raster", source: "grid-lights",
        paint: { "raster-opacity": 0.85 },
      });
      await Promise.all([wb("EG.ELC.ACCS.ZS"), wb("IT.NET.USER.ZS")]);
      legend("Grid — Earth at night", [
        { color: "#ffd60a", label: "City lights = the grid, seen from orbit" },
        { color: "transparent", label: "NASA Black Marble (VIIRS)" },
      ]);
    },
    async here(el) {
      if (needCountry(el)) return;
      const elec = wbHere("EG.ELC.ACCS.ZS");
      const net = wbHere("IT.NET.USER.ZS");
      el.innerHTML =
        `<div class="readouts">` +
        ro("Electricity", elec ? `${Math.round(elec.value)}<small>%</small>` : "—",
           elec ? (elec.value >= 99 ? "good" : elec.value >= 80 ? "warn" : "bad") : "",
           "population with access") +
        ro("Online", net ? `${Math.round(net.value)}<small>%</small>` : "—",
           net ? (net.value >= 80 ? "good" : net.value >= 50 ? "warn" : "bad") : "",
           "population using internet") +
        `</div>`;
    },
  },

  money: {
    num: "100.5", name: "Money",
    q: "What does a life cost here, and what is my money worth?",
    subs: [
      { id: "gdp", label: "GDP", title: "Money — GDP per capita, PPP",
        ramp: "money", from: "$1k", to: "$90k",
        fmt: (v) => `$${fmtBig(v)} GDP/capita (PPP)`,
        values: () => state.cache.wb["NY.GDP.PCAP.PP.CD"] },
      { id: "inflation", label: "Inflation", title: "Money — inflation, CPI yearly",
        ramp: "inflation", from: "0%", to: "25%+",
        fmt: (v) => `Inflation ${v.toFixed(1)}%`,
        values: () => state.cache.wb["FP.CPI.TOTL.ZG"] },
      { id: "gold", label: "Gold", title: "Money — gold reserves, USD value",
        ramp: "gold", from: "$10M", to: "$1T",
        fmt: (v) => `$${fmtBig(v)} in gold`,
        input: ["log10", ["max", ["get", "value"], 1]],
        values: () => state.cache.gold },
      { id: "debt", label: "Debt", title: "Money — government debt, % of GDP",
        ramp: "debt", from: "20%", to: "130%+",
        fmt: (v) => `Debt ${Math.round(v)}% of GDP`,
        values: () => state.cache.wb["GC.DOD.TOTL.GD.ZS"] },
    ],
    async applySub(id) {
      state.moneySub = id;
      const sub = this.subs.find((s) => s.id === id);
      document.querySelectorAll("#subdial button").forEach((b) =>
        b.classList.toggle("active", b.dataset.sub === id)
      );
      await addChoropleth({
        values: sub.values() || {},
        ramp: RAMPS[sub.ramp],
        fmt: sub.fmt,
        input: sub.input,
      });
      legend(sub.title, [
        { gradient: gradientCSS(RAMPS[sub.ramp]), from: sub.from, to: sub.to },
      ]);
    },
    async activate() {
      const [, , , resTotal, resNoGold] = await Promise.all([
        wb("NY.GDP.PCAP.PP.CD"), wb("FP.CPI.TOTL.ZG"), wb("GC.DOD.TOTL.GD.ZS"),
        wb("FI.RES.TOTL.CD"), wb("FI.RES.XGLD.CD"),
      ]);
      // gold reserves (USD) = total reserves − reserves excluding gold
      if (!state.cache.gold) {
        const gold = {};
        for (const [c3, r] of Object.entries(resTotal)) {
          const x = resNoGold[c3];
          if (!x) continue;
          const v = r.value - x.value;
          if (v > 1e6) gold[c3] = { value: v, year: r.year };
        }
        state.cache.gold = gold;
      }
      await this.applySub(state.moneySub || "gdp");
    },
    async here(el) {
      if (needCountry(el)) return;
      el.innerHTML = tuningHTML;
      const c = state.here.country;
      const gdp = wbHere("NY.GDP.PCAP.PP.CD");
      const infl = wbHere("FP.CPI.TOTL.ZG");
      const curCode = Object.keys(c.currencies || {})[0];
      const cur = curCode ? c.currencies[curCode] : null;
      let fx = null;
      if (curCode) {
        try {
          if (!state.cache.fx)
            state.cache.fx = (await getJSON("https://open.er-api.com/v6/latest/USD")).rates;
          fx = state.cache.fx?.[curCode];
        } catch (e) {}
      }
      const gold = state.cache.gold?.[c.cca3];
      const debt = wbHere("GC.DOD.TOTL.GD.ZS");
      el.innerHTML =
        `<div class="readouts">` +
        ro("GDP / capita", gdp ? `$${fmtBig(gdp.value)}` : "—", "", gdp ? `PPP · ${gdp.year}` : "") +
        ro("Inflation", infl ? `${infl.value.toFixed(1)}<small>%</small>` : "—",
           infl ? (infl.value < 4 ? "good" : infl.value < 10 ? "warn" : "bad") : "",
           infl ? `CPI · ${infl.year}` : "") +
        ro("Gold reserves", gold ? `$${fmtBig(gold.value)}` : "—", "", gold ? `USD value · ${gold.year}` : "no data") +
        ro("Gov. debt", debt ? `${Math.round(debt.value)}<small>%</small>` : "—",
           debt ? (debt.value < 50 ? "good" : debt.value < 90 ? "warn" : "bad") : "",
           debt ? `of GDP · ${debt.year}` : "no data") +
        ro("Currency", curCode ? `${cur?.symbol || ""} ${curCode}` : "—", "", cur?.name || "") +
        ro("US dollar", fx ? `${fx.toFixed(fx > 20 ? 0 : 2)}` : "—", "", curCode ? `1 USD in ${curCode} · daily rate` : "") +
        `</div>`;
    },
  },

  people: {
    num: "103.0", name: "People",
    q: "Who lives here, and how?",
    async activate() {
      const [density] = await Promise.all([
        wb("EN.POP.DNST"), wb("SP.POP.TOTL"), loadFacts(),
      ]);
      await addChoropleth({
        values: density,
        ramp: RAMPS.people,
        fmt: (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} people / km²`,
      });
      legend("People — population density", [
        { gradient: gradientCSS(RAMPS.people), from: "2 /km²", to: "2,000 /km²" },
      ]);
    },
    async here(el) {
      if (needCountry(el)) return;
      const c = state.here.country;
      const langs = Object.values(c.languages || {}).slice(0, 4).join(", ");
      const pop = wbHere("SP.POP.TOTL");
      const density = wbHere("EN.POP.DNST");
      el.innerHTML =
        `<div class="readouts">` +
        ro("Population", pop ? fmtBig(pop.value) : "—", "", c.name.common) +
        ro("Density", density ? Math.round(density.value) : "—", "", "people / km²") +
        ro("Languages", langs || "—", "", "", true) +
        ro("Capital", c.capital?.[0] || "—", "", "", true) +
        `<a class="ro wide pm-link" href="passport/#${c.cca3}">Passport map — where ${c.name.common}'s passport can take you →</a>` +
        `</div>`;
    },
  },

  signal: {
    num: "105.5", name: "Signal",
    q: "What is humanity doing and talking about right now?",
    async activate() {
      loadNews()
        .then((news) => {
          if (state.channel !== "signal" || map.getSource("news")) return;
          map.addSource("news", { type: "geojson", data: news });
          map.addLayer({
            id: "news", type: "circle", source: "news",
            paint: { "circle-radius": 2.5, "circle-color": "#ffffff", "circle-opacity": 0.5 },
          });
          popupOnHover("news", (p) => `${(p.name || "news cluster")}`);
          renderHere();
        })
        .catch(() => {
          state.cache.newsDown = true;
          if (state.channel === "signal") renderHere();
        });

      const el = document.createElement("div");
      el.className = "iss-marker";
      el.innerHTML = "<span></span>ISS";
      issMarker = new maplibregl.Marker({ element: el }).setLngLat([0, 0]).addTo(map);
      const tick = async () => {
        try {
          const d = await getJSON("https://api.wheretheiss.at/v1/satellites/25544");
          state.cache.iss = d;
          issMarker.setLngLat([d.longitude, d.latitude]);
          if (state.channel === "signal") renderHere();
        } catch (e) {}
      };
      tick();
      state.timers.iss = setInterval(tick, 5000);

      legend("Signal — right now", [
        { color: "#ffffff", label: "News events · last 60 min" },
        { color: "#64d2ff", label: "ISS · live position" },
        { color: "#3a3a3c", label: "Night side of Earth" },
      ]);
    },
    async here(el) {
      const me = state.here;
      const iss = state.cache.iss;
      const sun = subsolarPoint(new Date());
      const rad = Math.PI / 180;
      const elev =
        Math.asin(
          Math.sin(me.lat * rad) * Math.sin(sun.lat * rad) +
          Math.cos(me.lat * rad) * Math.cos(sun.lat * rad) * Math.cos((me.lng - sun.lng) * rad)
        ) / rad;
      const issDist = iss ? Math.round(haversine(me, { lat: iss.latitude, lng: iss.longitude })) : null;
      const newsCount = state.cache.news?.features?.length;
      el.innerHTML =
        `<div class="readouts">` +
        ro("UTC", new Date().toISOString().slice(11, 16)) +
        ro("Sun here", elev > 0 ? "Day" : "Night", "", `elevation ${Math.round(elev)}°`) +
        ro("ISS", issDist != null ? `${fmtBig(issDist)} <small>km</small>` : "—",
           issDist != null && issDist < 2000 ? "good" : "",
           iss ? `alt ${Math.round(iss.altitude)} km · ${fmtBig(Math.round(iss.velocity))} km/h` : "acquiring…", true) +
        ro("News pulses", newsCount ?? (state.cache.newsDown ? "Offline" : "—"), "",
           state.cache.newsDown ? "GDELT feed unreachable" : "geocoded events · last 60 min", true) +
        `</div>`;
    },
  },
};

/* ---------------- tuning ---------------- */

async function tune(ch) {
  if (state.channel === ch) return;
  state.channel = ch;
  const def = CHANNELS[ch];
  document.querySelectorAll(".chan").forEach((b) =>
    b.classList.toggle("active", b.dataset.ch === ch)
  );
  $("#freq-num").textContent = def.num;
  $("#freq-name").textContent = def.name;
  $("#freq-question").textContent = def.q;
  const sd = $("#subdial");
  if (def.subs) {
    const current = state.moneySub || def.subs[0].id;
    sd.innerHTML = def.subs
      .map((s) => `<button data-sub="${s.id}"${s.id === current ? ' class="active"' : ""}>${s.label}</button>`)
      .join("");
    sd.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => def.applySub(b.dataset.sub))
    );
    sd.classList.remove("hidden");
  } else {
    sd.classList.add("hidden");
  }
  setStatus("Tuning…");
  clearChannelLayers();
  // day/night shading only where it means something; data channels get full clarity
  if (map.getLayer("terminator-fill"))
    map.setLayoutProperty(
      "terminator-fill",
      "visibility",
      ["air", "ground", "signal"].includes(ch) ? "visible" : "none"
    );
  try {
    await def.activate();
    if (state.channel === ch) setStatus(LIVE);
  } catch (err) {
    setStatus(`Weak signal — some data unreachable`);
  }
  renderHere();
}

document.querySelectorAll(".chan").forEach((b) =>
  b.addEventListener("click", () => tune(b.dataset.ch))
);

/* ---------------- global alert watcher ---------------- */
// GDACS Orange/Red alerts surface on every channel, not just Ground.

async function refreshAlerts() {
  try {
    const gdacs = await loadGdacs();
    const active = gdacs.features
      .filter((f) => f.properties.level !== "Green")
      .sort(
        (a, b) =>
          (b.properties.level === "Red") - (a.properties.level === "Red") ||
          b.properties.ts - a.properties.ts
      );
    const pill = $("#alerts");
    if (!active.length) return pill.classList.add("hidden");
    const red = active.filter((f) => f.properties.level === "Red").length;
    const top = active[0];
    pill.classList.toggle("red", red > 0);
    pill.innerHTML = `<span class="adot"></span>${active.length} active alert${active.length > 1 ? "s" : ""} · ${top.properties.name}`;
    pill.classList.remove("hidden");
    pill.onclick = () => {
      state.interacted = true;
      tune("ground");
      map.flyTo({ center: top.geometry.coordinates.slice(0, 2), zoom: 4.5, duration: 2200 });
    };
  } catch (e) {
    /* proxy unreachable — pill stays as-is */
  }
}

refreshAlerts();
setInterval(refreshAlerts, 300e3);

// keep Ground's live layers fresh in place (cached() enforces the TTLs)
setInterval(async () => {
  if (state.channel !== "ground") return;
  try { map.getSource("quakes")?.setData(await loadQuakes()); } catch (e) {}
  try { map.getSource("gdacs")?.setData(await loadGdacs()); } catch (e) {}
}, 120e3);

/* ---------------- sparkline ---------------- */

function drawSpark(values) {
  const cv = $("#spark");
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  const min = Math.min(...values), max = Math.max(...values);
  const x = (i) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v) => h - 6 - ((v - min) / (max - min || 1)) * (h - 14);
  ctx.beginPath();
  values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.strokeStyle = "#0a84ff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.lineTo(x(values.length - 1), h); ctx.lineTo(x(0), h); ctx.closePath();
  ctx.fillStyle = "rgba(10,132,255,.14)"; ctx.fill();
  ctx.beginPath();
  ctx.arc(x(values.length - 1), y(values[values.length - 1]), 2.5, 0, 7);
  ctx.fillStyle = "#0a84ff"; ctx.fill();
  ctx.font = "9px -apple-system, sans-serif"; ctx.fillStyle = "#98989d";
  ctx.fillText(`${Math.round(min)}°`, 2, h - 1);
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(max)}°`, w - 2, 9);
}
