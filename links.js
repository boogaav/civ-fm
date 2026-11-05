/* CIV FM — Links
   Countries do not stand alone. With the Links pill on, the country you click
   draws arcs to its strongest partners on the layer you are tuned to:
   Money → who it sells to and buys from (UN Comtrade, goods), Home → where its
   people live abroad and where its immigrants were born (UN DESA migrant
   stock 2024). Data is baked by links/build_links.py. */

const LINKS = {
  money: {
    file: "links/trade.json", a: "x", b: "m", aT: "xT", bT: "mT",
    aLabel: "Sells to", bLabel: "Buys from", fmt: (v) => usd(v),
    src: (r) => `UN Comtrade, goods trade as reported by the country, ${r.y}.`,
    missing: "Trade links are still being collected from UN Comtrade. Home shows migration links now.",
  },
  home: {
    file: "links/migration.json", a: "out", b: "in", aT: "outT", bT: "inT",
    aLabel: "Its emigrants live in", bLabel: "Its immigrants were born in",
    fmt: (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v)),
    src: (r, f) => `UN DESA International Migrant Stock ${f.year}: people born in one country and living in another.`,
  },
};
const LINK_COLOR = { a: "#ff9f0a", b: "#64d2ff" }; // out from the country, in to it
const LINK_IDS = ["links-veil", "links-arc", "links-dot", "links-label"];
try { state.links = localStorage.getItem("civfm-links") === "on"; } catch (e) { state.links = false; }

// great-circle path a → b as [lng, lat] points, so arcs follow the globe
function greatCircle([lat1, lng1], [lat2, lng2], n = 48) {
  const r = Math.PI / 180, v = (la, lo) => [Math.cos(la * r) * Math.cos(lo * r), Math.cos(la * r) * Math.sin(lo * r), Math.sin(la * r)];
  const A = v(lat1, lng1), B = v(lat2, lng2);
  const d = Math.acos(Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
  if (!d) return [[lng1, lat1], [lng2, lat2]];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s1 = Math.sin((1 - t) * d) / Math.sin(d), s2 = Math.sin(t * d) / Math.sin(d);
    const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
    pts.push([Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r]);
  }
  // unwrap longitudes so a path across the date line does not jump the long way round
  for (let i = 1; i < pts.length; i++) while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360;
  for (let i = 1; i < pts.length; i++) while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360;
  return pts;
}

function clearLinks() {
  for (const id of LINK_IDS) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of ["links", "links-veil"]) if (map.getSource(id)) map.removeSource(id);
}

// called by renderHere after the channel's own card; host is the HERE body
async function drawLinks(host) {
  clearLinks();
  if (!state.links) return;
  const cfg = LINKS[state.channel];
  const box = document.createElement("div");
  box.className = "links";
  host.prepend(box); // you asked for links, so they lead the card
  if (!cfg) { box.innerHTML = `<p class="links-note">Links show on Money (trade) and Home (migration).</p>`; return; }
  const me = state.here && state.here.country;
  if (!me) return;
  let file, facts;
  try {
    [file, facts] = await Promise.all([state.cache[cfg.file] || getJSON(cfg.file).then((d) => (state.cache[cfg.file] = d)), loadFacts()]);
  } catch (e) { box.innerHTML = `<p class="links-note">${cfg.missing || "Weak signal: link data unreachable."}</p>`; return; }
  if (!box.isConnected || state.here.country !== me || LINKS[state.channel] !== cfg) return; // moved on meanwhile
  const rec = file.c[me.cca3];
  if (!rec || !(rec[cfg.a] || rec[cfg.b])) { box.innerHTML = `<p class="links-note">No link data for ${me.name.common}.</p>`; return; }

  const max = Math.max(...[...(rec[cfg.a] || []), ...(rec[cfg.b] || [])].map((p) => p[1]));
  const features = [];
  for (const dir of ["a", "b"])
    for (const [iso, v] of rec[cfg[dir]] || []) {
      const p = facts.by3[iso];
      if (!p || !p.latlng || !me.latlng) continue;
      const props = { dir, w: v / max, name: p.name.common };
      features.push({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: greatCircle(me.latlng, p.latlng) } });
      features.push({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: [p.latlng[1], p.latlng[0]] } });
    }
  clearLinks(); // a second render may have drawn while we were loading
  map.addSource("links", { type: "geojson", data: { type: "FeatureCollection", features } });
  // a translucent veil over the channel's colours so the arcs read first (four
  // quarter-world boxes: one world-sized polygon misdraws on the globe)
  map.addSource("links-veil", { type: "geojson", data: { type: "FeatureCollection", features: [-180, -90, 0, 90].map((x) => (
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[x, -85], [x + 90, -85], [x + 90, 85], [x, 85], [x, -85]]] } })) } });
  map.addLayer({ id: "links-veil", type: "fill", source: "links-veil",
    paint: { "fill-color": document.documentElement.dataset.theme === "day" ? "#fafaf8" : "#0e0e0e", "fill-opacity": 0.55 } });
  const color = ["match", ["get", "dir"], "a", LINK_COLOR.a, LINK_COLOR.b];
  map.addLayer({ id: "links-arc", type: "line", source: "links", filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-cap": "round" },
    paint: { "line-color": color, "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["get", "w"], 0, 1, 1, 5] } });
  map.addLayer({ id: "links-dot", type: "circle", source: "links", filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-color": color, "circle-radius": ["interpolate", ["linear"], ["get", "w"], 0, 3, 1, 7], "circle-stroke-width": 1, "circle-stroke-color": "#0b0b0d" } });
  map.addLayer({ id: "links-label", type: "symbol", source: "links", filter: ["==", ["geometry-type"], "Point"],
    layout: { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top", "text-font": ["Noto Sans Regular"] },
    paint: { "text-color": "#f5f5f7", "text-halo-color": "#0b0b0d", "text-halo-width": 1.2 } });

  const list = (dir) => {
    const rows = (rec[cfg[dir]] || []).slice(0, 5), total = rec[cfg[dir + "T"]];
    if (!rows.length) return "";
    return `<div class="links-k"><i style="background:${LINK_COLOR[dir]}"></i>${cfg[dir + "Label"]}${total ? ` <span>${cfg.fmt(total)} in all</span>` : ""}</div><ol>` +
      rows.map(([iso, v]) => `<li><span>${facts.by3[iso]?.flag || ""} ${facts.by3[iso]?.name.common || iso}</span><b>${cfg.fmt(v)}</b>${total ? `<em>${Math.round((v / total) * 100)}%</em>` : ""}</li>`).join("") + "</ol>";
  };
  box.innerHTML = `<div class="links-title">Links · ${me.name.common}</div>${list("a")}${list("b")}<p class="links-src">${cfg.src(rec, file)}</p>`;
}

$("#btn-links").addEventListener("click", () => {
  state.links = !state.links;
  try { localStorage.setItem("civfm-links", state.links ? "on" : "off"); } catch (e) {}
  syncLinksBtn();
  renderHere();
});
function syncLinksBtn() {
  const b = $("#btn-links");
  b.classList.toggle("on", state.links);
  b.setAttribute("aria-pressed", String(state.links));
}
syncLinksBtn();
