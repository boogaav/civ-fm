/* Future · 106.5 — every region's climate under the worst-case pathway (SSP5-8.5), 2026–2125.
   The emulator lives in future/model.js (window.Model); this file is the CIV FM channel around it.
   Uses app.js globals at call time: map, state, $, ro, legend, getJSON, renderHere, setStatus, showCaption, tuningHTML. */

const FM_MODEL = window.Model;
const FUT = {
  year: 2100, mode: "central", loading: null, regions: [], countries: new Map(),
  fc: null, playing: false, timer: null, hoverBound: false, colorKey: "",
};
try {
  const m = localStorage.getItem("civfm-future-mode");
  if (m === "central" || m === "high") FUT.mode = m;
} catch (e) {}

/* ---------------- data ---------------- */

function futBBox(geom) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const p of polys) for (const [x, y] of p[0]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function loadFuture() {
  if (FUT.loading) return FUT.loading;
  FUT.loading = (async () => {
    const topo = await getJSON("future/regions.json", 45000);
    const feats = topojson.feature(topo, topo.objects.regions).features;
    const byA3 = new Map();
    const lite = [];
    for (const f of feats) {
      const p = f.properties;
      const r = {
        kind: "region", id: f.id, name: p.n || "Unnamed region", type: p.t || "", a3: p.a,
        lat: p.y, lon: p.x, area: p.ar || 1, coastal: !!p.k, geometry: f.geometry, bbox: futBBox(f.geometry),
      };
      FM_MODEL.initRegion(r, p.c);
      FUT.regions[f.id] = r;
      if (!byA3.has(r.a3)) byA3.set(r.a3, []);
      byA3.get(r.a3).push(r);
      lite.push({ type: "Feature", id: f.id, properties: {}, geometry: f.geometry });
    }
    for (const [a3, regs] of byA3) {
      const meta = topo.countries[a3] || [a3, "", 0];
      const area = regs.reduce((s, r) => s + r.area, 0);
      const c = {
        kind: "country", id: a3, name: meta[0], continent: meta[1], pop: meta[2], regions: regs, area,
        lat: regs.reduce((s, r) => s + r.lat * r.area, 0) / area,
        lon: regs.reduce((s, r) => s + r.lon * r.area, 0) / area,
      };
      FM_MODEL.initCountry(c);
      regs.forEach((r) => (r.country = c));
      FUT.countries.set(a3, c);
    }
    const all = FUT.regions.filter(Boolean);
    FM_MODEL.buildTwins(all);
    all.forEach((r) => (r.kgToday = FM_MODEL.today(r).cl.kg));
    FUT.fc = { type: "FeatureCollection", features: lite };
    return FUT;
  })();
  FUT.loading.catch(() => (FUT.loading = null));
  return FUT.loading;
}

function inRing(x, y, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

function futRegionAt(lat, lng) {
  let near = null;
  for (const r of FUT.regions) {
    if (!r) continue;
    const [x0, y0, x1, y1] = r.bbox;
    if (lng < x0 - 0.4 || lng > x1 + 0.4 || lat < y0 - 0.4 || lat > y1 + 0.4) continue;
    const polys = r.geometry.type === "Polygon" ? [r.geometry.coordinates] : r.geometry.coordinates;
    for (const p of polys) {
      if (inRing(lng, lat, p[0]) && !p.slice(1).some((h) => inRing(lng, lat, h))) return r;
    }
    // simplified coastlines: accept the closest region when the point sits just offshore
    const d = (r.lat - lat) ** 2 + ((r.lon - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (!near || d < near.d) near = { r, d };
  }
  return near ? near.r : null;
}

/* ---------------- colour ---------------- */

function futHex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function futRamp(stops, t) {
  t = Math.max(0, Math.min(1, t));
  const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const a = futHex(stops[i]), b = futHex(stops[i + 1]);
  return "#" + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, "0")).join("");
}
const FUT_DIV = ["#ff453a", "#c2453c", "#6e4447", "#3a3a3c", "#35685a", "#2fa467", "#30d158"];
const FUT_HEAT = ["#ffd60a", "#ff9f0a", "#ff6b3a", "#ff453a", "#c22a4f", "#7a1a45"];
const fsgn = (v, d = 0) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);

const FUT_SUBS = {
  outlook: {
    label: "Outlook", title: "Future — net outlook, opportunity − risk",
    value: (r) => FM_MODEL.outlook(r, FUT.year, FUT.mode).net,
    color: (v) => futRamp(FUT_DIV, 0.5 + v / 120),
    fmt: (v) => (v >= 8 ? "Net gain " : v <= -8 ? "Net loss " : "Mixed ") + fsgn(v),
    legend: [{ gradient: FUT_DIV.join(","), from: "Loses more", to: "Gains more" }],
  },
  zone: {
    label: "Climate zone", title: "Future — Köppen climate zone",
    value: (r) => FM_MODEL.snap(r, FUT.year, FUT.mode).cl.kg,
    color: (k) => FM_MODEL.KG[k][1],
    fmt: (k) => `${k} · ${FM_MODEL.KG[k][0]}`,
    legend: [
      { color: "#0078ff", label: "Tropical (A)" }, { color: "#f5a500", label: "Arid (B)" },
      { color: "#64ff50", label: "Temperate (C)" }, { color: "#37c8ff", label: "Continental (D)" },
      { color: "#b2b2b2", label: "Polar (E)" },
    ],
  },
  crops: {
    label: "Crops", title: "Future — crop potential vs today",
    value: (r) => FM_MODEL.snap(r, FUT.year, FUT.mode).pot - FM_MODEL.today(r).pot,
    color: (v) => futRamp(FUT_DIV, 0.5 + v / 80),
    fmt: (v) => `Crop potential ${fsgn(v)} pts`,
    legend: [{ gradient: FUT_DIV.join(","), from: "−40 pts", to: "+40 pts" }],
  },
  warming: {
    label: "Warming", title: "Future — local warming vs 1850–1900",
    value: (r) => FM_MODEL.snap(r, FUT.year, FUT.mode).m.dT,
    color: (v) => futRamp(FUT_HEAT, (v - 1) / 9),
    fmt: (v) => `${fsgn(v, 1)}°C vs pre-industrial`,
    legend: [{ gradient: FUT_HEAT.join(","), from: "+1°C", to: "+10°C" }],
  },
};
const futSub = () => FUT_SUBS[state.subs.future || "outlook"];

function futRecolor() {
  if (!map.getSource("future")) return;
  const key = FUT.year + FUT.mode + (state.subs.future || "outlook");
  if (key === FUT.colorKey) return;
  FUT.colorKey = key;
  const sub = futSub();
  for (const r of FUT.regions) if (r) map.setFeatureState({ source: "future", id: r.id }, { col: sub.color(sub.value(r)) });
}

function futLegend() {
  const sub = futSub();
  legend(`${sub.title} · ${FUT.year}`, [
    ...sub.legend,
    { color: "transparent", label: `SSP5-8.5 · ${FUT.mode === "high" ? "high-end" : "central"} · emulator, not a forecast` },
  ]);
}

/* ---------------- year bar ---------------- */

function futSyncBar() {
  $("#fut-year").textContent = FUT.year;
  $("#fut-global").textContent = `global ${fsgn(FM_MODEL.GT(FUT.year, FUT.mode), 1)}°C`;
  $("#fut-slider").value = FUT.year;
  document.querySelectorAll("#future-bar .fut-mode button").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === FUT.mode));
  $("#fut-play").innerHTML = FUT.playing
    ? '<svg viewBox="0 0 14 14"><path d="M3 1.5h3v11H3zM8 1.5h3v11H8z"/></svg>'
    : '<svg viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z"/></svg>';
  $("#fut-play").setAttribute("aria-label", FUT.playing ? "Pause" : "Play years");
}

function futSetYear(y) {
  y = Math.max(FM_MODEL.Y0, Math.min(FM_MODEL.Y1, y));
  if (y === FUT.year) return;
  FUT.year = y;
  futSyncBar(); futRecolor(); futLegend(); renderHere();
}

function futPlay(on) {
  FUT.playing = on;
  clearInterval(FUT.timer);
  if (on) {
    if (FUT.year >= FM_MODEL.Y1) futSetYear(FM_MODEL.Y0);
    FUT.timer = setInterval(() => (FUT.year >= FM_MODEL.Y1 ? futPlay(false) : futSetYear(FUT.year + 1)), 180);
  }
  futSyncBar();
}

$("#fut-slider").addEventListener("input", (e) => futSetYear(+e.target.value));
$("#fut-play").addEventListener("click", () => futPlay(!FUT.playing));
document.querySelectorAll("#future-bar .fut-mode button").forEach((b) =>
  b.addEventListener("click", () => {
    FUT.mode = b.dataset.mode;
    try { localStorage.setItem("civfm-future-mode", FUT.mode); } catch (e) {}
    futSyncBar(); futRecolor(); futLegend(); renderHere();
  }));

// called from clearChannelLayers() when tuning away
function futureTeardown() {
  futPlay(false);
  FUT.colorKey = "";
  $("#future-bar").classList.add("hidden");
  document.body.classList.remove("ch-future");
}

/* ---------------- HERE card ---------------- */

function futList(items, cls) {
  return items.slice(0, 3).map((x) => `<li class="${cls}"><b>${x.t}</b><span>${x.d}</span></li>`).join("");
}

/* ---------------- channel ---------------- */

const FUTURE_CHANNEL = {
  num: "106.5", name: "Future",
  q: "What will this place become in the worst-case century?",
  subs: Object.entries(FUT_SUBS).map(([id, s]) => ({ id, label: s.label })),
  async applySub(id) {
    state.subs.future = id;
    document.querySelectorAll("#subdial button").forEach((b) => b.classList.toggle("active", b.dataset.sub === id));
    futRecolor(); futLegend(); renderHere();
  },
  async activate() {
    setStatus("Tuning… loading 4,595 regions");
    await loadFuture();
    if (state.channel !== "future") return;
    map.addSource("future", { type: "geojson", data: FUT.fc });
    map.addLayer({
      id: "future", type: "fill", source: "future",
      paint: { "fill-color": ["to-color", ["coalesce", ["feature-state", "col"], "#2c2c2e"]], "fill-opacity": 0.66 },
    }, "terminator-fill");
    map.addLayer({
      id: "future-line", type: "line", source: "future",
      paint: { "line-color": "#0b0b0d", "line-width": 0.5, "line-opacity": ["interpolate", ["linear"], ["zoom"], 1.5, 0, 3.5, 0.45] },
    }, "terminator-fill");
    if (!FUT.hoverBound) {
      FUT.hoverBound = true;
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      map.on("mousemove", "future", (e) => {
        const r = FUT.regions[e.features[0].id];
        if (!r) return;
        const sub = futSub();
        popup.setLngLat(e.lngLat)
          .setHTML(`<b>${r.name}</b> <span style="color:#98989d">${r.country.name}</span><br>${sub.fmt(sub.value(r))} · ${FUT.year}`)
          .addTo(map);
      });
      map.on("mouseleave", "future", () => popup.remove());
    }
    FUT.colorKey = "";
    futRecolor(); futLegend(); futSyncBar();
    $("#future-bar").classList.remove("hidden");
    document.body.classList.add("ch-future");
    showCaption("Worst-case emissions, SSP5-8.5. Green: warming gives a place more than it takes. Red: the reverse.");
    if (state.borders) applyBorders();
  },
  async here(el) {
    el.innerHTML = tuningHTML;
    try { await loadFuture(); } catch (e) {
      el.innerHTML = `<div class="here-hint">Climate data unreachable right now.</div>`; return;
    }
    const r = futRegionAt(state.here.lat, state.here.lng);
    if (!r) { el.innerHTML = `<div class="here-hint">Open ocean. Set HERE on land to see how it changes.</div>`; return; }
    const M = FM_MODEL, y = FUT.year, mode = FUT.mode;
    const s0 = M.today(r), s1 = M.snap(r, y, mode), o = M.outlook(r, y, mode), m = s1.m;
    const c0 = s0.cl, c1 = s1.cl;
    const oc = M.outlook(r.country, y, mode);
    const tw = M.twins(r, c1, 1), t = tw && tw.list[0];
    const netCls = (v) => (v >= 8 ? "good" : v <= -8 ? "bad" : "warn");
    const dGs = c1.gs - c0.gs, dPot = s1.pot - s0.pot;
    const crops = [
      o.newC.length ? `new: ${o.newC.map((i) => M.CROPS[i].name.toLowerCase()).join(", ")}` : "",
      o.lostC.length ? `lost: ${o.lostC.map((i) => M.CROPS[i].name.toLowerCase()).join(", ")}` : "",
    ].filter(Boolean).join(" · ");
    el.innerHTML =
      `<div class="readouts fut">` +
      ro(`${r.name} in ${y}`, `${fsgn(m.dT, 1)}°C`, m.dT >= 6 ? "bad" : m.dT >= 3 ? "warn" : "",
        `warming vs 1850–1900 · ${fsgn(m.dToday, 1)}° vs today`, true) +
      ro("Net outlook", fsgn(o.net), netCls(o.net), `gain ${o.O.toFixed(0)} · risk ${o.R.toFixed(0)}`) +
      ro(r.country.name, fsgn(oc.net), netCls(oc.net), "nationwide net") +
      ro("Climate", `${c0.kg} → ${c1.kg}`, "", `${M.KG[c1.kg][0]}. ${M.landscape(c1.kg)}`, true) +
      (t ? ro("Feels like", tw.novel ? "No match today" : `${t.r.name}`, "",
        tw.novel ? `a climate no region has now · nearest: ${t.r.name}, ${t.r.country.name}` : `${t.r.country.name}, today · ${t.q} match`, true) : "") +
      ro("Growing season", `${c1.gs} <small>days</small>`, dGs >= 10 ? "good" : "", `${fsgn(dGs)} vs today`) +
      ro("Crop potential", `${s1.pot.toFixed(0)}<small>/100</small>`, dPot >= 5 ? "good" : dPot <= -5 ? "bad" : "", `${s0.pot.toFixed(0)} today`) +
      ro("Summer highs", `${c1.txHot.toFixed(0)}°`, c1.txHot >= 35 ? "bad" : "", `${c0.txHot.toFixed(0)}° today`) +
      ro("Winter lows", `${c1.tnCold.toFixed(0)}°`, "", `${c0.tnCold.toFixed(0)}° today`) +
      (crops ? ro("Crops", crops, "", "rainfed, FAO EcoCrop", true) : "") +
      `<div class="ro wide"><span class="k">Gains</span>${o.opp.length ? `<ul class="fut-list">${futList(o.opp, "g")}</ul>` : `<span class="sub">No clear gains from warming here.</span>`}</div>` +
      `<div class="ro wide"><span class="k">Risks</span><ul class="fut-list">${futList(o.risk, "r")}</ul></div>` +
      `<div class="psrc">Emulator: IPCC AR6 SSP5-8.5 scaled onto WorldClim 2.1 climate. Direction and rough size, not a forecast.</div>` +
      `</div>`;
  },
};

CHANNELS.future = FUTURE_CHANNEL;
