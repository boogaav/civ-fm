/* CIV FM — Country card generator.
   One country, its outline and every national metric the site has, drawn on
   a canvas you can download, copy or share to Instagram and X. Standalone:
   loads the same data the globe uses (vendor/, the Worker's World Bank
   route, place/data.json, taxes.js) and nothing else. */

const PROXY = "https://civfm-proxy.boogaav.workers.dev";
const ROOT = new URL("../", document.currentScript.src).href;
const $ = (s) => document.querySelector(s);

const FORMATS = {
  square: { w: 1080, h: 1080, label: "Square", hint: "Instagram post" },
  story: { w: 1080, h: 1920, label: "Story", hint: "Instagram or X story" },
  wide: { w: 1600, h: 900, label: "Wide", hint: "X post" },
};

const WB = {
  pop: "SP.POP.TOTL", dnst: "EN.POP.DNST", life: "SP.DYN.LE00.IN", gdp: "NY.GDP.PCAP.PP.CD",
  infl: "FP.CPI.TOTL.ZG", debt: "GC.DOD.TOTL.GD.ZS", net: "IT.NET.USER.ZS", elec: "EG.ELC.ACCS.ZS", water: "ER.H2O.FWST.ZS",
};

const data = { facts: null, shapes: null, wb: {}, place: null, visa: null };
const state = { iso3: null, format: "square", busy: false };

/* ---------------- loading ---------------- */

async function getJSON(url, ms = 30000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally { clearTimeout(t); }
}

async function loadFacts() {
  if (data.facts) return data.facts;
  const rows = await getJSON(ROOT + "vendor/world-countries.json");
  const by3 = {};
  for (const r of rows) by3[r.cca3] = r;
  data.facts = { rows, by3 };
  return data.facts;
}

async function loadShapes() {
  if (data.shapes) return data.shapes;
  const fc = await getJSON(ROOT + "vendor/countries.geo.json");
  const by3 = {};
  for (const f of fc.features) by3[f.id] = f;
  data.shapes = by3;
  return by3;
}

async function wb(code) {
  if (data.wb[code]) return data.wb[code];
  const lsKey = `civfm-wb-${code}`;
  try {
    const hit = JSON.parse(localStorage.getItem(lsKey) || "null");
    if (hit && Date.now() - hit.t < 24 * 3600e3 && hit.from === 2005) return (data.wb[code] = hit.d);
  } catch (e) {}
  try {
    const d = await getJSON(`${PROXY}/wb/${code}`, 30000);
    data.wb[code] = d;
    try { localStorage.setItem(lsKey, JSON.stringify({ t: Date.now(), from: 2005, d })); } catch (e) {}
    return d;
  } catch (e) { return (data.wb[code] = {}); }
}

async function loadPlace() {
  if (data.place) return data.place;
  try { data.place = await getJSON(ROOT + "place/data.json", 45000); } catch (e) { data.place = { years: [], n: {} }; }
  return data.place;
}

// visa-free or on-arrival destinations per passport, from the tidy CSV
async function loadVisa() {
  if (data.visa) return data.visa;
  const counts = {};
  try {
    const txt = await (await fetch(ROOT + "vendor/passport-index-tidy-iso3.csv")).text();
    for (const line of txt.split("\n").slice(1)) {
      const [p, d, req] = line.trim().split(",");
      if (!p || p === d) continue;
      const c = (counts[p] ||= { free: 0, arrival: 0 });
      if (req === "visa free" || /^\d+$/.test(req)) c.free++;
      else if (req === "visa on arrival" || req === "eta") c.arrival++;
    }
  } catch (e) {}
  data.visa = counts;
  return counts;
}

/* ---------------- numbers ---------------- */

const fmtBig = (n) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
};

function tenYear(s) {
  if (!s || s.length < 3) return null;
  const last = s[s.length - 1];
  const base = s.find(([y]) => y >= last[0] - 10);
  if (!base || base[0] === last[0]) return null;
  return { d: last[1] - base[1], from: base, to: last };
}

function fmtDelta(t, pts, digits = 1) {
  const d = pts ? t.d : t.from[1] ? (t.d / Math.abs(t.from[1])) * 100 : NaN;
  if (!Number.isFinite(d)) return "";
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  const n = Math.abs(d);
  return `${sign}${n >= 10 && digits <= 1 ? Math.round(n) : n.toFixed(digits)}${pts ? (digits > 1 ? "" : " pts") : "%"}`;
}

function placeRec(series, years) {
  if (!series) return null;
  const s = [];
  for (let i = 0; i < years.length; i++) if (series[i] != null) s.push([years[i], series[i]]);
  if (!s.length) return null;
  return { value: s[s.length - 1][1], year: String(s[s.length - 1][0]), s };
}

// the twelve cells of the card, in order
function metrics(iso3) {
  const f = data.facts.by3[iso3];
  const cc = f?.cca2;
  const w = (k) => data.wb[WB[k]]?.[iso3] || null;
  const nat = data.place.n[iso3];
  const hdi = nat ? placeRec(nat.hdi, data.place.years) : null;
  const pop = w("pop"), dnst = w("dnst"), life = w("life"), gdp = w("gdp"), infl = w("infl"), debt = w("debt"), net = w("net"), elec = w("elec"), water = w("water");
  const inc = typeof TAXES !== "undefined" && cc ? TAXES.income[cc] : null;
  const corp = typeof TAXES !== "undefined" && cc ? TAXES.corporate[cc] : null;
  const visa = data.visa?.[iso3];
  const cell = (label, rec, fmt, { pts = false, better = null, digits = 1, sub = "" } = {}) => {
    const t = rec && tenYear(rec.s);
    return {
      label, value: rec ? fmt(rec.value) : "—",
      sub: rec ? (sub ? `${sub} · ${rec.year}` : rec.year) : "no data",
      s: rec?.s || null,
      delta: t ? fmtDelta(t, pts, digits) : "",
      since: t ? t.from[0] : null,
      tone: !t || Math.abs(t.d) < 1e-9 || !better ? "" : (t.d > 0) === (better === "up") ? "good" : "bad",
    };
  };
  return [
    cell("Population", pop, (v) => fmtBig(v), { sub: "people" }),
    cell("Density", dnst, (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)}`, { sub: "people per km²" }),
    cell("Life expectancy", life, (v) => `${v.toFixed(1)} yrs`, { pts: true, better: "up", sub: "at birth" }),
    cell("Human development", hdi, (v) => v.toFixed(3), { pts: true, better: "up", digits: 3, sub: hdi ? (hdi.value >= 0.8 ? "very high" : hdi.value >= 0.7 ? "high" : hdi.value >= 0.55 ? "medium" : "low") : "" }),
    cell("GDP per person", gdp, (v) => `$${fmtBig(v)}`, { better: "up", sub: "PPP" }),
    cell("Inflation", infl, (v) => `${v.toFixed(1)}%`, { pts: true, better: "down", sub: "consumer prices, yearly" }),
    cell("Government debt", debt, (v) => `${Math.round(v)}%`, { pts: true, better: "down", sub: "of GDP" }),
    cell("Online", net, (v) => `${Math.round(v)}%`, { pts: true, better: "up", sub: "use the internet" }),
    cell("Electricity", elec, (v) => `${Math.round(v)}%`, { pts: true, better: "up", sub: "have access" }),
    cell("Water stress", water, (v) => `${Math.round(v)}%`, { pts: true, better: "down", sub: "of freshwater withdrawn" }),
    { label: "Taxes", value: inc ? `${inc[0]}%` : "—", sub: inc ? `top income${corp ? ` · ${corp[0]}% corporate` : ""} · 2026` : "no data", s: null, delta: "", since: null, tone: "" },
    { label: "Passport", value: visa ? `${visa.free + visa.arrival}` : "—", sub: visa ? "destinations visa-free or on arrival" : "no data", s: null, delta: "", since: null, tone: "" },
  ];
}

/* ---------------- drawing ---------------- */

const FONT = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Roboto, sans-serif";
const INK = "#f5f5f7", MUTED = "#98989d", FAINT = "#636366", ACCENT = "#0a84ff", OK = "#30d158", BAD = "#ff453a";

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function fitText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

// project a country's rings into a box; countries across the antimeridian
// are unwrapped first so Russia, Fiji and the USA come out in one piece
function projectShape(feature, box) {
  const polys = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  let minX = 180, maxX = -180;
  for (const p of polys) for (const [x] of p[0]) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
  const wrap = maxX - minX > 180;
  const lon = (x) => (wrap && x < 0 ? x + 360 : x);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p[0]) {
    const lx = lon(x); if (lx < x0) x0 = lx; if (lx > x1) x1 = lx; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const sw = (x1 - x0) * k || 1, sh = (y1 - y0) || 1;
  const scale = Math.min(box.w / sw, box.h / sh);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const pt = ([x, y]) => [cx + (lon(x) - mx) * k * scale, cy - (y - my) * scale];
  return polys.map((p) => p.map((ring) => ring.map(pt)));
}

function drawShape(ctx, feature, box) {
  if (!feature) {
    ctx.fillStyle = FAINT; ctx.font = `500 ${Math.round(box.h * 0.06)}px ${FONT}`; ctx.textAlign = "center";
    ctx.fillText("No outline available", box.x + box.w / 2, box.y + box.h / 2);
    ctx.textAlign = "left";
    return;
  }
  const polys = projectShape(feature, box);
  // glow
  ctx.save();
  const g = ctx.createRadialGradient(box.x + box.w / 2, box.y + box.h / 2, 10, box.x + box.w / 2, box.y + box.h / 2, Math.max(box.w, box.h) * 0.7);
  g.addColorStop(0, "rgba(10,132,255,.22)"); g.addColorStop(1, "rgba(10,132,255,0)");
  ctx.fillStyle = g; ctx.fillRect(box.x - 100, box.y - 100, box.w + 200, box.h + 200);
  ctx.restore();
  ctx.save();
  ctx.shadowColor = "rgba(10,132,255,.55)"; ctx.shadowBlur = 36;
  ctx.fillStyle = "rgba(10,132,255,.92)";
  for (const poly of polys) {
    ctx.beginPath();
    poly.forEach((ring) => { ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); });
    ctx.fill("evenodd");
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(158,207,255,.9)"; ctx.lineWidth = 2; ctx.lineJoin = "round";
  for (const poly of polys) {
    ctx.beginPath();
    poly.forEach((ring) => { ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); });
    ctx.stroke();
  }
}

function drawSpark(ctx, s, x, y, w, h, color) {
  const vals = s.map((p) => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const y0 = s[0][0], y1 = s[s.length - 1][0];
  ctx.beginPath();
  s.forEach(([yr, v], i) => {
    const px = x + ((yr - y0) / Math.max(1, y1 - y0)) * w;
    const py = y + h - ((v - min) / (max - min || 1)) * h;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
}

function drawCell(ctx, m, x, y, w, h, u) {
  rrect(ctx, x, y, w, h, 16 * u); ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1; ctx.stroke();
  const pad = 18 * u;
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillStyle = MUTED; ctx.font = `500 ${19 * u}px ${FONT}`;
  ctx.fillText(fitText(ctx, m.label, w - 2 * pad), x + pad, y + pad + 17 * u);
  ctx.fillStyle = INK; ctx.font = `600 ${40 * u}px ${FONT}`;
  ctx.fillText(fitText(ctx, m.value, w - 2 * pad), x + pad, y + pad + 60 * u);
  ctx.fillStyle = FAINT; ctx.font = `400 ${16 * u}px ${FONT}`;
  ctx.fillText(fitText(ctx, m.sub, w - 2 * pad), x + pad, y + pad + 82 * u);
  if (m.s && m.delta) {
    // bottom row: sparkline, arrow and change, "since year"
    const color = m.tone === "good" ? OK : m.tone === "bad" ? BAD : MUTED;
    const s = m.s.filter(([yr]) => yr >= m.since);
    const sh = 18 * u, sy = y + h - pad - sh;
    drawSpark(ctx, s, x + pad, sy, 64 * u, sh, color);
    const arrow = m.delta.startsWith("+") ? "↗" : m.delta.startsWith("−") ? "↘" : "→";
    const tx = x + pad + 76 * u, ty = sy + sh - 1;
    ctx.fillStyle = color; ctx.font = `600 ${18 * u}px ${FONT}`;
    ctx.fillText(`${arrow} ${m.delta}`, tx, ty);
    const dw = ctx.measureText(`${arrow} ${m.delta}`).width;
    ctx.fillStyle = FAINT; ctx.font = `400 ${14 * u}px ${FONT}`;
    ctx.fillText(fitText(ctx, `since ${m.since}`, x + w - pad - (tx + dw + 7 * u)), tx + dw + 7 * u, ty);
  }
}

function layout(fmt) {
  const { w, h } = FORMATS[fmt];
  if (fmt === "wide") {
    return {
      w, h, u: 1,
      header: { x: 60, y: 60, w: 560 },
      map: { x: 60, y: 250, w: 560, h: 520 },
      grid: { x: 680, y: 70, w: 860, h: 740, cols: 3, rows: 4, gap: 16 },
      footer: { y: h - 40 },
    };
  }
  if (fmt === "story") {
    return {
      w, h, u: 1.05,
      header: { x: 70, y: 90, w: 940 },
      map: { x: 190, y: 290, w: 700, h: 440 },
      grid: { x: 70, y: 780, w: 940, h: 1040, cols: 2, rows: 6, gap: 18 },
      footer: { y: h - 56 },
    };
  }
  return {
    w, h, u: 0.92,
    header: { x: 60, y: 56, w: 520 },
    map: { x: 620, y: 40, w: 400, h: 320 },
    grid: { x: 60, y: 396, w: 960, h: 610, cols: 3, rows: 4, gap: 14 },
    footer: { y: h - 42 },
  };
}

function draw() {
  const cv = $("#card");
  const L = layout(state.format);
  cv.width = L.w; cv.height = L.h;
  const ctx = cv.getContext("2d");
  const f = data.facts.by3[state.iso3];
  const u = L.u;

  // background
  ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, L.w, L.h);
  const bg = ctx.createLinearGradient(0, 0, L.w, L.h);
  bg.addColorStop(0, "rgba(255,255,255,.035)"); bg.addColorStop(1, "rgba(10,132,255,.05)");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, L.w, L.h);

  // header
  const H = L.header;
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.font = `600 ${22 * u}px ${FONT}`; ctx.fillStyle = ACCENT;
  ctx.fillText("CIV FM · COUNTRY CARD", H.x, H.y + 20 * u);
  ctx.font = `700 ${64 * u}px ${FONT}`; ctx.fillStyle = INK;
  const flag = f.flag || "";
  const nameY = H.y + 95 * u;
  ctx.fillText(flag, H.x, nameY);
  const fw = flag ? ctx.measureText(flag).width + 18 * u : 0;
  let size = 64 * u;
  ctx.font = `700 ${size}px ${FONT}`;
  while (ctx.measureText(f.name.common).width > H.w - fw && size > 30) { size -= 2; ctx.font = `700 ${size}px ${FONT}`; }
  ctx.fillText(f.name.common, H.x + fw, nameY);
  ctx.font = `400 ${24 * u}px ${FONT}`; ctx.fillStyle = MUTED;
  const subParts = [f.name.official !== f.name.common ? f.name.official : null, f.capital?.[0] ? `Capital ${f.capital[0]}` : null, f.subregion || f.region].filter(Boolean);
  ctx.fillText(fitText(ctx, subParts.join(" · "), H.w), H.x, nameY + 38 * u);
  if (f.area) {
    ctx.fillStyle = FAINT; ctx.font = `400 ${20 * u}px ${FONT}`;
    const langs = Object.values(f.languages || {}).slice(0, 3).join(", ");
    ctx.fillText(fitText(ctx, `${Math.round(f.area).toLocaleString("en")} km²${langs ? ` · ${langs}` : ""}`, H.w), H.x, nameY + 70 * u);
  }

  // map
  drawShape(ctx, data.shapes[state.iso3], L.map);

  // grid
  const G = L.grid;
  const cw = (G.w - G.gap * (G.cols - 1)) / G.cols, ch = (G.h - G.gap * (G.rows - 1)) / G.rows;
  metrics(state.iso3).forEach((m, i) => {
    const c = i % G.cols, r = Math.floor(i / G.cols);
    if (r >= G.rows) return;
    drawCell(ctx, m, G.x + c * (cw + G.gap), G.y + r * (ch + G.gap), cw, ch, u);
  });

  // footer
  ctx.fillStyle = INK; ctx.font = `700 ${22 * u}px ${FONT}`; ctx.textAlign = "left";
  ctx.fillText("civ.fm", 60, L.footer.y);
  ctx.fillStyle = FAINT; ctx.font = `400 ${17 * u}px ${FONT}`;
  ctx.fillText(fitText(ctx, "World Bank · Global Data Lab · Passport Index · curated tax tables · ten-year trends", L.w - 400), 60 + 90 * u, L.footer.y);
  ctx.textAlign = "right"; ctx.fillStyle = MUTED; ctx.font = `500 ${18 * u}px ${FONT}`;
  ctx.fillText(`civ.fm/card/#${state.iso3}`, L.w - 60, L.footer.y);
  ctx.textAlign = "left";
}

/* ---------------- page ---------------- */

async function render() {
  const iso3 = state.iso3;
  state.busy = true;
  $("#status").textContent = "Loading data…";
  try {
    await Promise.all([loadFacts(), loadShapes(), loadPlace(), loadVisa(), ...Object.values(WB).map(wb)]);
  } catch (e) {
    $("#status").textContent = "Some data is unreachable right now.";
  }
  if (state.iso3 !== iso3) return;
  draw();
  state.busy = false;
  const missing = metrics(iso3).filter((m) => m.value === "—").length;
  $("#status").textContent = [
    state.suggested === iso3 ? `${data.facts.by3[iso3].name.common} is where you seem to be. Pick any other country above.` : "",
    missing ? `${missing} of 12 metrics have no data for this country.` : "",
  ].filter(Boolean).join(" ");
  location.hash = iso3;
  document.title = `${data.facts.by3[iso3].name.common} — Country card — CIV FM`;
}

function pick(iso3) {
  if (!data.facts.by3[iso3]) return;
  state.iso3 = iso3;
  $("#country").value = iso3;
  render();
}

async function blob() {
  return new Promise((res) => $("#card").toBlob(res, "image/png"));
}

const fileName = () => `civfm-${state.iso3.toLowerCase()}-${state.format}.png`;

async function download() {
  const b = await blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = fileName(); a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function share() {
  const b = await blob();
  const file = new File([b], fileName(), { type: "image/png" });
  const name = data.facts.by3[state.iso3].name.common;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${name} in numbers`, text: `${name} in numbers · civ.fm/card/#${state.iso3}` }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  await download();
  $("#status").textContent = "Saved the image. Attach it to your post.";
}

async function copy() {
  try {
    const b = await blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
    $("#status").textContent = "Image copied. Paste it into your post.";
  } catch (e) {
    $("#status").textContent = "Copying images is not supported here. Use Download.";
  }
}

function postX() {
  const name = data.facts.by3[state.iso3].name.common;
  const text = `${data.facts.by3[state.iso3].flag || ""} ${name} in numbers · civ.fm/card/#${state.iso3}`;
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  $("#status").textContent = "Download the image and attach it to the post.";
}

// the constitution in force, as a PDF built from the hosted text
async function downloadConst() {
  const b = $("#btn-const"); b.disabled = true;
  try {
    data.civic ||= await getJSON(ROOT + "civic/civic.json", 30000);
    const v = data.civic.c[state.iso3], c = v?.const;
    if (!c?.local) { $("#status").textContent = `No constitution text on file for ${data.facts.by3[state.iso3].name.common}.`; return; }
    await window.downloadConstitution(state.iso3, { name: data.facts.by3[state.iso3].name.common, title: c.title, enacted: c.enacted, revised: c.revised, id: c.id }, (m) => ($("#status").textContent = m));
  } catch (e) { $("#status").textContent = "Could not load the constitution index."; }
  finally { b.disabled = false; }
}

async function locate() {
  if (!navigator.geolocation) return;
  $("#status").textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const g = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=en`);
      const hit = data.facts.rows.find((r) => r.cca2 === g.countryCode);
      if (hit) pick(hit.cca3); else $("#status").textContent = "No country at your location.";
    } catch (e) { $("#status").textContent = "Location lookup failed."; }
  }, () => ($("#status").textContent = "Location denied."), { timeout: 8000 });
}

(async function init() {
  await loadFacts();
  const sel = $("#country");
  const rows = [...data.facts.rows].sort((a, b) => a.name.common.localeCompare(b.name.common));
  sel.innerHTML = rows.map((r) => `<option value="${r.cca3}">${r.flag || ""} ${r.name.common}</option>`).join("");
  sel.addEventListener("change", () => pick(sel.value));

  const fm = $("#format");
  fm.innerHTML = Object.entries(FORMATS).map(([id, f]) => `<button data-f="${id}" title="${f.hint}">${f.label}</button>`).join("");
  fm.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    state.format = b.dataset.f;
    fm.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    $("#frame").dataset.format = state.format;
    if (!state.busy) draw();
  }));
  fm.querySelector(`[data-f="${state.format}"]`).classList.add("active");
  $("#frame").dataset.format = state.format;

  $("#btn-download").addEventListener("click", download);
  $("#btn-share").addEventListener("click", share);
  $("#btn-copy").addEventListener("click", copy);
  $("#btn-x").addEventListener("click", postX);
  $("#btn-const").addEventListener("click", downloadConst);
  $("#btn-locate").addEventListener("click", locate);
  if (!navigator.canShare) $("#btn-share").textContent = "Share (save)";

  // the hash wins; otherwise the country the visitor is in (from their IP,
  // answered by the Worker's edge, nothing stored), then the browser's own
  // region, then a sensible first card
  const hash = location.hash.replace("#", "").toUpperCase();
  if (data.facts.by3[hash]) pick(hash);
  else {
    const region = (navigator.language || "").split("-")[1]?.toUpperCase();
    const byRegion = region && rows.find((r) => r.cca2 === region)?.cca3;
    pick(byRegion || "UKR");
    getJSON(`${PROXY}/whereami`, 6000).then((w) => {
      const hit = w.country && rows.find((r) => r.cca2 === w.country);
      if (!hit || location.hash.replace("#", "").toUpperCase() !== state.iso3) return;
      state.suggested = hit.cca3;
      if (hit.cca3 !== state.iso3) pick(hit.cca3); else render();
    }).catch(() => {});
  }
  window.addEventListener("hashchange", () => {
    const h = location.hash.replace("#", "").toUpperCase();
    if (h !== state.iso3 && data.facts.by3[h]) pick(h);
  });
})();
