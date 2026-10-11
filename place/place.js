/* CIV FM — Place channel (93.0): the region you are in, not the country average.
   1,774 sub-national regions from Global Data Lab's Subnational Human
   Development Database (via the Open Numbers mirror, 1990 to 2019), baked by
   place/build_place.py into regions.json (TopoJSON) and data.json (series).
   Registers CHANNELS.place after app.js, like future/future.js. Other
   channels call placeHint() to add a "this region" line to their HERE card. */

const PLACE = { fc: null, data: null, loading: null, hoverBound: false, colorKey: "" };

const PLACE_RAMPS = {
  hdi: [[0.35, "#ff453a"], [0.55, "#ff9f0a"], [0.7, "#ffd60a"], [0.8, "#30d158"], [0.93, "#6ae58a"]],
  life: [[55, "#ff453a"], [65, "#ff9f0a"], [73, "#ffd60a"], [80, "#30d158"], [86, "#6ae58a"]],
  msch: [[1, "#ff453a"], [5, "#ff9f0a"], [8, "#ffd60a"], [11, "#30d158"], [13.5, "#6ae58a"]],
  gni: [[2.7, "#1b2b40"], [3.3, "#14456f"], [3.9, "#0a84ff"], [4.5, "#4da3ff"], [5.0, "#9ecfff"]], // log10 USD
};

const PLACE_SUBS = {
  living: { label: "Living", key: "hdi", title: "Place — Human Development Index", from: "0.35", to: "0.95",
    fmt: (v) => `HDI ${v.toFixed(3)}`, pts: false, label2: "Human development" },
  health: { label: "Health", key: "life", title: "Place — life expectancy", from: "55 yrs", to: "86 yrs",
    fmt: (v) => `Life expectancy ${v.toFixed(1)} yrs`, pts: true, label2: "Years of life" },
  school: { label: "School", key: "msch", title: "Place — years of schooling, adults 25+", from: "1 yr", to: "13+ yrs",
    fmt: (v) => `${v.toFixed(1)} years of schooling`, pts: true, label2: "Schooling" },
  income: { label: "Income", key: "gni", title: "Place — income per person, GNI at PPP", from: "$500", to: "$100k",
    fmt: (v) => `$${fmtBig(v)} per person`, pts: false, label2: "Income per person", log: true },
};

/* ---------------- colour ---------------- */

const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function rampColor(ramp, v) {
  if (v == null || !Number.isFinite(v)) return "#2c2c2e";
  if (v <= ramp[0][0]) return ramp[0][1];
  for (let i = 1; i < ramp.length; i++) {
    if (v <= ramp[i][0]) {
      const [v0, c0] = ramp[i - 1], [v1, c1] = ramp[i];
      const t = (v - v0) / (v1 - v0), a = hexRGB(c0), b = hexRGB(c1);
      return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * t)).join(",")})`;
    }
  }
  return ramp[ramp.length - 1][1];
}

/* ---------------- data ---------------- */

async function loadPlace() {
  if (PLACE.fc) return PLACE;
  if (!PLACE.loading)
    PLACE.loading = (async () => {
      const [topo, data] = await Promise.all([getJSON(PLACE_BASE + "regions.json", 45000), getJSON(PLACE_BASE + "data.json", 45000)]);
      const fc = topojson.feature(topo, topo.objects.regions);
      fc.features = fc.features.filter((f) => f.geometry);
      fc.features.forEach((f, i) => {
        f.id = i;
        f.properties.bbox = geoBBox(f.geometry);
      });
      PLACE.fc = fc;
      PLACE.data = data;
      return PLACE;
    })().catch((e) => { PLACE.loading = null; throw e; });
  return PLACE.loading;
}
// the script tag's src must be read at load time, before currentScript changes
const PLACE_BASE = new URL("./", document.currentScript.src).href;

// latest value with its year, and the series as [[year, value]] for trend()
function placeRec(series) {
  if (!series) return null;
  const years = PLACE.data.years;
  const s = [];
  for (let i = 0; i < years.length; i++) if (series[i] != null) s.push([years[i], series[i]]);
  if (!s.length) return null;
  const [year, value] = s[s.length - 1];
  return { value, year: String(year), s };
}

const placeRegion = (code) => PLACE.data.r[code];
const placeNational = (iso) => PLACE.data.n[iso];

/* ---------------- point in region ---------------- */

function geoBBox(g) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const walk = (ring) => { for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } };
  (g.type === "Polygon" ? [g.coordinates] : g.coordinates).forEach((poly) => poly.forEach(walk));
  return [x0, y0, x1, y1];
}

function ringHas(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polyHas(poly, x, y) {
  if (!ringHas(poly[0], x, y)) return false;
  for (let k = 1; k < poly.length; k++) if (ringHas(poly[k], x, y)) return false;
  return true;
}

function placeAt(lat, lng) {
  if (!PLACE.fc) return null;
  for (const f of PLACE.fc.features) {
    const [x0, y0, x1, y1] = f.properties.bbox;
    if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    if (polys.some((p) => polyHas(p, lng, lat))) return f;
  }
  return null;
}

/* ---------------- globe ---------------- */

const placeSub = () => PLACE_SUBS[state.subs.place || "living"];

function placeRecolor() {
  if (!map.getSource("place")) return;
  const sub = placeSub();
  if (PLACE.colorKey === sub.key) return;
  PLACE.colorKey = sub.key;
  const ramp = PLACE_RAMPS[sub.key];
  for (const f of PLACE.fc.features) {
    const rec = placeRec(placeRegion(f.properties.g)?.[sub.key]);
    const v = rec ? (sub.log ? Math.log10(Math.max(rec.value, 1)) : rec.value) : null;
    map.setFeatureState({ source: "place", id: f.id }, { col: rampColor(ramp, v) });
  }
}

function placeLegend() {
  const sub = placeSub();
  legend(sub.title, [
    { gradient: gradientCSS(PLACE_RAMPS[sub.key]), from: sub.from, to: sub.to },
    { color: "transparent", label: "1,774 regions · Global Data Lab, 2019" },
  ]);
}

function placeTeardown() {
  PLACE.colorKey = "";
  document.body.classList.remove("ch-place");
}

/* ---------------- HERE ---------------- */

const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

// where this region stands among its country's regions on one indicator
function placeRank(f, key) {
  const mine = placeRec(placeRegion(f.properties.g)?.[key]);
  if (!mine) return null;
  const peers = PLACE.fc.features
    .filter((x) => x.properties.a === f.properties.a)
    .map((x) => placeRec(placeRegion(x.properties.g)?.[key])?.value)
    .filter((v) => v != null)
    .sort((a, b) => b - a);
  if (peers.length < 2) return null;
  return { rank: peers.indexOf(mine.value) + 1, of: peers.length };
}

function placeCompare(regionRec, natRec, pts, digits = 1) {
  if (!regionRec || !natRec) return "";
  const d = regionRec.value - natRec.value;
  if (Math.abs(d) < (pts ? 0.05 : natRec.value * 0.005)) return "about the national level";
  const txt = pts ? `${Math.abs(d).toFixed(digits)} ${d > 0 ? "above" : "below"}` : `${Math.round((Math.abs(d) / natRec.value) * 100)}% ${d > 0 ? "above" : "below"}`;
  return `${txt} the national level`;
}

async function herePlace(el) {
  el.innerHTML = tuningHTML;
  try { await loadPlace(); } catch (e) {
    el.innerHTML = `<div class="here-hint">Region data unreachable right now.</div>`;
    return;
  }
  if (!el.isConnected) return;
  const f = placeAt(state.here.lat, state.here.lng);
  if (!f) {
    el.innerHTML = `<div class="here-hint">No region at this point. Set HERE on land for regional readouts.</div>`;
    return;
  }
  const p = f.properties, r = placeRegion(p.g), n = placeNational(p.a);
  const country = state.cache.facts?.by3[p.a]?.name.common || p.a;
  const hdi = placeRec(r?.hdi), life = placeRec(r?.life), msch = placeRec(r?.msch), esch = placeRec(r?.esch), gni = placeRec(r?.gni), pop = placeRec(r?.pop);
  const sub = placeSub();
  const rank = placeRank(f, sub.key);
  const tier = hdi ? (hdi.value >= 0.8 ? "very high" : hdi.value >= 0.7 ? "high" : hdi.value >= 0.55 ? "medium" : "low") : "";
  el.innerHTML =
    `<div class="readouts">` +
    `<div class="ro wide"><span class="k">Region</span><span class="val">${rEsc(p.n)}</span>` +
    `<span class="sub">${rEsc(country)}${rank ? ` · ${ordinal(rank.rank)} of ${rank.of} regions by ${sub.label2.toLowerCase()}` : ""}</span></div>` +
    ro("Human development", hdi ? hdi.value.toFixed(3) : "—",
       hdi ? (hdi.value >= 0.8 ? "good" : hdi.value >= 0.7 ? "" : hdi.value >= 0.55 ? "warn" : "bad") : "",
       hdi ? `${tier} · ${placeCompare(hdi, placeRec(n?.hdi), true, 3)} · ${hdi.year}` : "no data", true,
       trend(hdi, { pts: true, better: "up", label: "HDI", digits: 3 })) +
    ro("Life expectancy", life ? `${life.value.toFixed(1)} <small>yrs</small>` : "—",
       life ? (life.value >= 78 ? "good" : life.value >= 68 ? "warn" : "bad") : "",
       life ? placeCompare(life, placeRec(n?.life), true) : "", false,
       trend(life, { pts: true, better: "up", label: "Years of life" })) +
    ro("Schooling", msch ? `${msch.value.toFixed(1)} <small>yrs</small>` : "—", "",
       msch ? `adults 25+${esch ? ` · children expect ${esch.value.toFixed(1)}` : ""}` : "", false,
       trend(msch, { pts: true, better: "up", label: "Schooling" })) +
    ro("Income", gni ? `$${fmtBig(gni.value)}` : "—", "",
       gni ? `per person, PPP · ${placeCompare(gni, placeRec(n?.gni), false)}` : "", false,
       trend(gni, { better: "up", label: "Income" })) +
    ro("People", pop ? fmtBig(pop.value * 1000) : "—", "", pop ? `in the region · ${pop.year}` : "", false,
       trend(pop, { label: "Population" })) +
    `<div class="psrc">Global Data Lab, Subnational HDI · regions as the database defines them, data to 2019</div>` +
    `</div>`;
}

// One line for another channel's HERE card: this region's value against the
// country's. Appends when the point sits in a known region; silent otherwise.
async function placeHint(el, key, label, fmt) {
  try { await loadPlace(); } catch (e) { return; }
  if (!el.isConnected || !state.here) return;
  const f = placeAt(state.here.lat, state.here.lng);
  if (!f) return;
  const rec = placeRec(placeRegion(f.properties.g)?.[key]);
  const nat = placeRec(placeNational(f.properties.a)?.[key]);
  if (!rec) return;
  const host = el.querySelector(".readouts") || el;
  const div = document.createElement("div");
  div.className = "ro wide place-hint";
  div.innerHTML =
    `<span class="k">${label} here · ${rEsc(f.properties.n)}</span>` +
    `<span class="val">${fmt(rec.value)}</span>` +
    `<span class="sub">${placeCompare(rec, nat, key !== "gni", key === "hdi" ? 3 : 1)} · region, ${rec.year} · <a href="#" class="place-go">Place channel →</a></span>`;
  host.appendChild(div);
  div.querySelector(".place-go").addEventListener("click", (e) => { e.preventDefault(); tune("place"); });
}

/* ---------------- channel ---------------- */

const PLACE_CHANNEL = {
  num: "93.0", name: "Place",
  q: "What is this region like, not the country average?",
  subs: Object.entries(PLACE_SUBS).map(([id, s]) => ({ id, label: s.label })),
  async applySub(id) {
    state.subs.place = id;
    document.querySelectorAll("#subdial button").forEach((b) => b.classList.toggle("active", b.dataset.sub === id));
    placeRecolor(); placeLegend(); renderHere();
  },
  async activate() {
    setStatus("Tuning… loading 1,774 regions");
    await Promise.all([loadPlace(), loadFacts()]);
    if (state.channel !== "place") return;
    map.addSource("place", { type: "geojson", data: PLACE.fc });
    map.addLayer({
      id: "place", type: "fill", source: "place",
      paint: { "fill-color": ["to-color", ["coalesce", ["feature-state", "col"], "#2c2c2e"]], "fill-opacity": 0.62 },
    }, "terminator-fill");
    map.addLayer({
      id: "place-line", type: "line", source: "place",
      paint: { "line-color": "#0b0b0d", "line-width": 0.5, "line-opacity": ["interpolate", ["linear"], ["zoom"], 1.5, 0, 3.5, 0.45] },
    }, "terminator-fill");
    if (!PLACE.hoverBound) {
      PLACE.hoverBound = true;
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      map.on("mousemove", "place", (e) => {
        const p = e.features[0].properties;
        const sub = placeSub();
        const rec = placeRec(placeRegion(p.g)?.[sub.key]);
        const country = state.cache.facts?.by3[p.a]?.name.common || p.a;
        const t = rec && tenYear(rec.s);
        popup.setLngLat(e.lngLat)
          .setHTML(`<b>${rEsc(p.n)}</b> <span style="color:#98989d">${rEsc(country)}</span><br>` +
            (rec ? `${sub.fmt(rec.value)} <span style="color:#98989d">(${rec.year})</span>` : "no data") +
            (t ? `<br><span style="color:#98989d">${t.d > 0 ? "↗" : t.d < 0 ? "↘" : "→"} ${fmtDelta(t, sub.pts, sub.key === "hdi" ? 3 : 1)} since ${t.from[0]}</span>` : ""))
          .addTo(map);
      });
      map.on("mouseleave", "place", () => popup.remove());
    }
    PLACE.colorKey = "";
    placeRecolor(); placeLegend();
    document.body.classList.add("ch-place");
    if (state.borders) applyBorders();
    if (!state.here) showCaption("Every country, region by region. Click anywhere for the region you are in.");
  },
  here: herePlace,
};

CHANNELS.place = PLACE_CHANNEL;
