/* Hothouse Atlas climate emulator.
   Global pathway: IPCC AR6 SSP5-8.5. Baseline: WorldClim 2.1 (1970–2000) monthly climate per region.
   Downscaling by pattern scaling with seasonal amplification; impacts from published response functions. */
(function () {
"use strict";
const Y0 = 2026, Y1 = 2125, NOW = 2025;
const WC_REF = 0.45;               // global warming of the WorldClim 1970–2000 baseline vs 1850–1900
const DAYS = [31,28.25,31,30,31,30,31,31,30,31,30,31];

function monotone(pts) {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), d = [], m = [];
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2*t3 - 3*t2 + 1) * ys[i] + (t3 - 2*t2 + t) * h * m[i] + (-2*t3 + 3*t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
function lin(tab, x, cap) {
  let i = 0; while (i < tab.length - 2 && x > tab[i + 1][0]) i++;
  const [x0, y0] = tab[i], [x1, y1] = tab[i + 1];
  const v = y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  return cap != null ? Math.min(cap, Math.max(tab[0][1], v)) : Math.max(tab[0][1], v);
}
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ---- Global pathway ---- */
const gtCentral = monotone([[1850,0],[1950,.3],[1985,.45],[2005,.85],[2025,1.40],[2030,1.62],[2040,2.00],[2050,2.45],[2060,2.95],[2070,3.45],[2080,3.95],[2090,4.45],[2100,4.90],[2110,5.35],[2125,5.95]]);
const T_NOW = gtCentral(NOW);
const GT = (y, mode) => { const c = gtCentral(y); return mode === "high" && y > NOW ? T_NOW + (c - T_NOW) * 1.30 : c; };
const slrCentral = monotone([[2005,0],[2025,.08],[2030,.10],[2040,.16],[2050,.23],[2060,.31],[2070,.40],[2080,.51],[2090,.63],[2100,.77],[2125,1.03],[2150,1.32]]);
const slrHigh = monotone([[2005,0],[2025,.08],[2030,.11],[2040,.19],[2050,.30],[2070,.55],[2090,1.05],[2100,1.60],[2125,2.60],[2150,4.80]]);
const SLR = (y, mode) => (mode === "high" ? slrHigh : slrCentral)(y);
const HEAT50 = [[0,1],[1,4.8],[1.5,8.6],[2,13.9],[4,39.2],[5,51.9]];
const HEAT50I = [[0,0],[1,1.2],[1.5,2.0],[2,2.7],[4,5.3],[5,6.6]];
const RAIN10 = [[0,1],[1,1.3],[1.5,1.5],[2,1.7],[4,2.7],[5,3.2]];
const RAIN10I = [[0,0],[1,6.7],[1.5,10.5],[2,14.0],[4,30.2],[5,38.3]];
const DRY10 = [[0,1],[1,1.7],[1.5,2.0],[2,2.4],[4,4.1],[5,4.95]];

/* ---- Spatial pattern ---- */
function patternFactor(lat, area, coastal) {
  let land = 1.45 + 1.45 * smooth(45, 80, lat);
  if (lat < -35) land -= 0.35 * smooth(-35, -55, lat);
  if (lat < -62) land = 1.55;
  const ocean = 0.92 + 1.3 * smooth(50, 82, lat);
  let m = 0;
  if (coastal) m = area < 3e3 ? 0.7 : area < 3e4 ? 0.45 : area < 3e5 ? 0.2 : 0.08;
  else if (area > 3e5) land += 0.05;
  return land * (1 - m) + ocean * m;
}
// Seasonal shape of warming: Arctic winters warm far faster than summers; mid-latitude summers warm a bit faster.
function seasonalShape(lat) {
  const A = lat >= 0 ? 0.2 * smooth(25, 40, lat) - 0.9 * smooth(48, 75, lat) : 0.15 * smooth(-25, -40, lat) - 0.3 * smooth(-55, -70, lat);
  const peak = lat >= 0 ? 6 : 0;
  return DAYS.map((_, m) => 1 + A * Math.cos(2 * Math.PI * (m - peak) / 12));
}
const P_LAT = [[-90,4],[-60,3],[-45,1],[-33,-3.5],[-20,-1.5],[-10,.5],[0,2],[10,1],[20,-1.5],[32,-3.5],[40,-2],[48,1],[55,3],[65,4.5],[80,6],[90,6]];
const P_HOT = [
  { lat:[30,46], lon:[-10,42], v:-4.5 }, { lat:[-35,-15], lon:[10,41], v:-3.5 }, { lat:[8,30], lon:[-118,-77], v:-3.2 },
  { lat:[-14,5], lon:[-75,-45], v:-2.2 }, { lat:[-37,-27], lon:[112,126], v:-5 }, { lat:[-42,-27], lon:[-75,-69], v:-4.5 },
  { lat:[30,42], lon:[-125,-104], v:-2.5 }, { lat:[8,32], lon:[66,92], v:3.2 }, { lat:[-5,12], lon:[30,52], v:3 }, { lat:[20,40], lon:[100,125], v:2.2 },
];
function precipSens(lat, lon) {
  for (const h of P_HOT) if (lat >= h.lat[0] && lat <= h.lat[1] && lon >= h.lon[0] && lon <= h.lon[1]) return h.v;
  return lin(P_LAT, lat);
}
const slrAdj = lat => lat > 58 ? .55 : lat > 50 ? .85 : Math.abs(lat) < 25 ? 1.12 : 1;

/* ---- Köppen-Geiger (Beck et al. 2018 criteria) ---- */
const KG = {
  Af:["Tropical rainforest","#0000ff"], Am:["Tropical monsoon","#0078ff"], Aw:["Tropical savanna","#46aafa"],
  BWh:["Hot desert","#ff0000"], BWk:["Cold desert","#ff9696"], BSh:["Hot semi-arid","#f5a500"], BSk:["Cold semi-arid steppe","#ffdc64"],
  Csa:["Hot-summer Mediterranean","#ffff00"], Csb:["Warm-summer Mediterranean","#c8c800"], Csc:["Cold-summer Mediterranean","#969600"],
  Cwa:["Monsoon humid subtropical","#96ff96"], Cwb:["Subtropical highland","#64c864"], Cwc:["Cold subtropical highland","#329632"],
  Cfa:["Humid subtropical","#c8ff50"], Cfb:["Temperate oceanic","#64ff50"], Cfc:["Subpolar oceanic","#32c800"],
  Dsa:["Hot-summer continental, dry summer","#ff00ff"], Dsb:["Warm-summer continental, dry summer","#c800c8"], Dsc:["Subarctic, dry summer","#963296"], Dsd:["Extreme subarctic, dry summer","#966496"],
  Dwa:["Hot-summer continental, dry winter","#aaafff"], Dwb:["Warm-summer continental, dry winter","#5a78dc"], Dwc:["Subarctic, dry winter","#4b50b4"], Dwd:["Extreme subarctic, dry winter","#320087"],
  Dfa:["Hot-summer humid continental","#00ffff"], Dfb:["Warm-summer humid continental","#37c8ff"], Dfc:["Subarctic","#007d7d"], Dfd:["Extreme subarctic","#00465f"],
  ET:["Tundra","#b2b2b2"], EF:["Ice cap","#686868"],
};
function landscape(k) {
  if (k === "EF") return "Permanent ice";
  if (k === "ET") return "Treeless tundra: moss, sedge and dwarf shrubs";
  if (k === "Af") return "Dense evergreen rainforest";
  if (k === "Am") return "Monsoon rainforest";
  if (k[0] === "A") return "Savanna grassland and dry tropical forest";
  if (k.startsWith("BW")) return k[2] === "h" ? "Hot desert: sand, rock, sparse shrubs" : "Cold desert: bare ground and scrub";
  if (k.startsWith("BS")) return k[2] === "h" ? "Hot semi-arid scrub and grassland" : "Dry steppe grassland";
  if (k[0] === "C") {
    if (k[1] === "s") return "Mediterranean scrub, olive groves and vineyards";
    if (k === "Cfc") return "Windswept subpolar moor and grassland";
    if (k[1] === "w") return k[2] === "a" ? "Humid subtropical farmland, rice and tea" : "Highland grassland and pine";
    return k[2] === "a" ? "Humid subtropical forest and farmland" : "Temperate broadleaf forest and green pasture";
  }
  if (k[2] === "a") return "Hot-summer prairie, corn and deciduous forest";
  if (k[2] === "b") return "Mixed forest and grain farmland";
  if (k[2] === "c") return "Boreal taiga: spruce, pine, birch and bog";
  return "Sparse larch taiga on deep permafrost";
}
function koppen(ta, pr, lat) {
  let Tann = 0, Pann = 0, Thot = -99, Tcold = 99, Pdry = 1e9, Ps = 0;
  let Psdry = 1e9, Pswet = 0, Pwdry = 1e9, Pwwet = 0, n10 = 0;
  for (let m = 0; m < 12; m++) {
    const t = ta[m], p = pr[m];
    Tann += t / 12; Pann += p; if (t > Thot) Thot = t; if (t < Tcold) Tcold = t; if (p < Pdry) Pdry = p; if (t >= 10) n10++;
    const summer = lat >= 0 ? m >= 3 && m <= 8 : m <= 2 || m >= 9;
    if (summer) { Ps += p; if (p < Psdry) Psdry = p; if (p > Pswet) Pswet = p; }
    else { if (p < Pwdry) Pwdry = p; if (p > Pwwet) Pwwet = p; }
  }
  const Pw = Pann - Ps;
  const Pth = 2 * Tann + (Pw >= 0.7 * Pann ? 0 : Ps >= 0.7 * Pann ? 28 : 14);
  if (Thot < 10) return Thot > 0 ? "ET" : "EF";
  if (Pann < 10 * Pth) return (Pann < 5 * Pth ? "BW" : "BS") + (Tann >= 18 ? "h" : "k");
  if (Tcold >= 18) return Pdry >= 60 ? "Af" : Pdry >= 100 - Pann / 25 ? "Am" : "Aw";
  const L1 = Tcold > 0 ? "C" : "D";
  const L2 = Psdry < 40 && Psdry < Pwwet / 3 ? "s" : Pwdry < Pswet / 10 ? "w" : "f";
  const L3 = Thot >= 22 ? "a" : n10 >= 4 ? "b" : L1 === "D" && Tcold < -38 ? "d" : "c";
  return L1 + L2 + L3;
}
const KG_GROUP = k => k[0] === "A" ? "Tropical" : k[0] === "B" ? "Arid" : k[0] === "C" ? "Temperate" : k[0] === "D" ? "Continental" : "Polar";

/* ---- Derived climate ---- */
function daysAbove(arr, th) {
  let n = 0;
  for (let d = 1.5; d < 365; d += 3) {
    const x = d / 365 * 12 - 0.5, i = Math.floor(x), t = x - i;
    const a = arr[(i + 12) % 12], b = arr[(i + 13) % 12];
    if (a + (b - a) * t >= th) n += 3;
  }
  return Math.min(365, n);
}
const PF_NAMES = ["None", "Sporadic", "Discontinuous", "Continuous"];
function derive(cl, lat) {
  const { ta, tn, tx, pr } = cl;
  let Tann = 0, Pann = 0, hdd = 0, cdd = 0, txHot = -99, tnCold = 99;
  for (let m = 0; m < 12; m++) {
    Tann += ta[m] / 12; Pann += pr[m];
    hdd += DAYS[m] * Math.max(0, 18 - ta[m]); cdd += DAYS[m] * Math.max(0, ta[m] - 18);
    if (tx[m] > txHot) txHot = tx[m]; if (tn[m] < tnCold) tnCold = tn[m];
  }
  cl.Tann = Tann; cl.Pann = Pann; cl.hdd = hdd; cl.cdd = cdd; cl.txHot = txHot; cl.tnCold = tnCold;
  cl.kg = koppen(ta, pr, lat);
  cl.gs = daysAbove(ta, 5);            // thermal growing season (days with mean temp ≥ 5 °C)
  cl.ff = daysAbove(tn, 0);            // days with average low above freezing
  cl.pf = Tann < -7 ? 3 : Tann < -3 ? 2 : Tann < -1 ? 1 : 0;
  cl.pfShare = cl.pf >= 1 ? 1 : 0;
  return cl;
}

/* ---- Crops: EcoCrop suitability (FAO ECOCROP parameters) with extreme-heat penalty ---- */
const CROPS = [
  { id:"wheat",   name:"Wheat",       gs:5,  t:[5,15,23,27],  r:[300,750,900,1600],   kill:null, heat:30 },
  { id:"barley",  name:"Barley",      gs:4,  t:[3,12,20,30],  r:[200,500,1000,2000],  kill:null, heat:30 },
  { id:"potato",  name:"Potato",      gs:4,  t:[5,14,22,28],  r:[250,500,800,2000],   kill:-1,   heat:29 },
  { id:"maize",   name:"Maize",       gs:5,  t:[10,18,32,40], r:[400,600,1200,1800],  kill:0,    heat:33 },
  { id:"soy",     name:"Soybean",     gs:4,  t:[10,20,30,38], r:[450,600,1500,1800],  kill:0,    heat:33 },
  { id:"rice",    name:"Rice",        gs:4,  t:[12,20,30,36], r:[1000,1500,2000,4000],kill:0,    heat:35 },
  { id:"grape",   name:"Wine grapes", gs:6,  t:[8,15,27,33],  r:[250,500,900,1600],   kill:-2,   heat:36, chill:12 },
  { id:"coffee",  name:"Coffee",      gs:12, t:[14,18,24,28], r:[750,1400,2300,4200], kill:2,    heat:31 },
];
const trap = (v, a) => v <= a[0] || v >= a[3] ? 0 : v < a[1] ? (v - a[0]) / (a[1] - a[0]) : v <= a[2] ? 1 : (a[3] - v) / (a[3] - a[2]);
function cropScores(cl) {
  const out = new Array(CROPS.length);
  for (let c = 0; c < CROPS.length; c++) {
    const K = CROPS[c]; let rs = trap(cl.Pann, K.r);
    if (K.chill != null && Math.min(...cl.ta) > K.chill) rs = 0;
    let best = 0;
    if (rs > 0) for (let s = 0; s < 12; s++) {
      let ts = 1, hot = -99;
      for (let k = 0; k < K.gs; k++) {
        const m = (s + k) % 12;
        if (K.kill != null && cl.tn[m] < K.kill) { ts = 0; break; }
        const v = trap(cl.ta[m], K.t); if (v < ts) ts = v;
        if (cl.tx[m] > hot) hot = cl.tx[m];
        if (ts === 0) break;
      }
      if (ts > 0) { const hf = clamp01(1 - 0.08 * Math.max(0, hot - K.heat)); const v = ts * hf; if (v > best) best = v; }
    }
    out[c] = Math.round(best * rs * 100);
  }
  return out;
}
const potential = s => { const t = s.slice().sort((a, b) => b - a); return (t[0] + t[1] + t[2]) / 3; };

/* ---- Entity state ---- */
function initRegion(r, c) {
  r.b = { tn: c.slice(0, 12).map(v => v / 10), tx: c.slice(12, 24).map(v => v / 10), pr: c.slice(24, 36) };
  r.f = patternFactor(r.lat, r.area, r.coastal);
  r.p = precipSens(r.lat, r.lon);
  r.sm = seasonalShape(r.lat);
  r.slrF = slrAdj(r.lat);
  r.arctic = r.coastal && r.lat > 64 && r.a3 !== "FIN" && r.a3 !== "SWE";
}
function initCountry(c) {
  const regs = c.regions.filter(r => r.b), tot = regs.reduce((s, r) => s + r.area, 0) || 1;
  c.cregs = regs; c.wt = regs.map(r => r.area / tot);
  c.f = regs.reduce((s, r, i) => s + r.f * c.wt[i], 0) || patternFactor(c.lat, c.area, true);
  c.p = regs.reduce((s, r, i) => s + r.p * c.wt[i], 0);
  const coast = regs.filter(r => r.coastal), ctot = coast.reduce((s, r) => s + r.area, 0);
  c.coastal = coast.length > 0;
  c.slrF = ctot ? coast.reduce((s, r) => s + r.slrF * r.area, 0) / ctot : 1;
  c.coastShare = Math.min(1, 0.3 + ctot / tot);
  c.arctic = regs.some(r => r.arctic);
}
function rawClim(r, y, mode) {
  const g = GT(y, mode), d = (g - WC_REF) * r.f, pf = Math.max(0.3, 1 + r.p / 100 * (g - WC_REF));
  const ta = new Array(12), tn = new Array(12), tx = new Array(12), pr = new Array(12);
  for (let m = 0; m < 12; m++) {
    const dm = d * r.sm[m];
    tn[m] = r.b.tn[m] + dm; tx[m] = r.b.tx[m] + dm; ta[m] = (tn[m] + tx[m]) / 2; pr[m] = r.b.pr[m] * pf;
  }
  return { ta, tn, tx, pr };
}
function snap(e, y, mode) {
  if (y <= NOW) mode = "central";
  const key = y + mode;
  if (e._k === key) return e._v;
  let cl, crops, pot;
  if (e.kind === "region") {
    cl = derive(rawClim(e, y, mode), e.lat);
    crops = cropScores(cl); pot = potential(crops);
  } else {
    const ta = Array(12).fill(0), tn = Array(12).fill(0), tx = Array(12).fill(0), pr = Array(12).fill(0);
    crops = Array(CROPS.length).fill(0); pot = 0; let pfs = 0;
    e.cregs.forEach((r, i) => {
      const s = snap(r, y, mode), w = e.wt[i];
      for (let m = 0; m < 12; m++) { ta[m] += s.cl.ta[m] * w; tn[m] += s.cl.tn[m] * w; tx[m] += s.cl.tx[m] * w; pr[m] += s.cl.pr[m] * w; }
      for (let k = 0; k < crops.length; k++) crops[k] += s.crops[k] * w;
      pot += s.pot * w; if (s.cl.pf >= 1) pfs += w;
    });
    crops = crops.map(Math.round);
    cl = derive({ ta, tn, tx, pr }, e.lat);
    cl.pfShare = pfs;
  }
  const v = { y, mode, cl, crops, pot, m: scalars(e, y, mode) };
  e._k = key; e._v = v;
  return v;
}
function today(e) { if (!e._t) { e._t = snap(e, NOW, "central"); e._k = null; } return e._t; }

function scalars(e, y, mode) {
  const g = GT(y, mode), g0 = T_NOW;
  const dT = g * e.f, lev = dT / 1.45;
  return {
    g, dT, dToday: (g - g0) * e.f, lev,
    heat50: lin(HEAT50, lev, 50), heatI: lin(HEAT50I, lev),
    rain: e.p * (g - g0), rainF: lin(RAIN10, lev, 10), rainI: lin(RAIN10I, lev),
    drought: e.p < -0.5 ? lin(DRY10, lev, 10) : null,
    slr: e.coastal ? SLR(y, mode) * e.slrF : null,
    ship: e.arctic ? Math.max(0, Math.min(11, 3.5 + 1.6 * (g - T_NOW))) : null,
  };
}

/* ---- Opportunities vs risks ---- */
function outlook(e, y, mode) {
  const s1 = snap(e, y, mode);
  if (s1.o) return s1.o;
  const s0 = today(e), c0 = s0.cl, c1 = s1.cl, m = s1.m, m0 = s0.m;
  const opp = [], risk = [];
  const cropNames = idx => idx.map(i => CROPS[i].name.toLowerCase()).join(", ");
  const newC = [], lostC = [];
  s1.crops.forEach((v, i) => { const v0 = s0.crops[i]; if (v0 < 20 && v >= 40) newC.push(i); if (v0 >= 40 && v < 20) lostC.push(i); });
  const dPot = s1.pot - s0.pot;
  let O = 0, R = 0;

  // farming
  if (dPot >= 3 || newC.length) {
    O += 30 * clamp01(dPot / 30);
    opp.push({ w: dPot + newC.length * 8, t: "Better farming conditions", d: `Crop potential ${s0.pot.toFixed(0)} → ${s1.pot.toFixed(0)} out of 100${newC.length ? `. Newly viable: ${cropNames(newC)}` : ""}` });
  }
  if (dPot <= -3 || lostC.length) {
    R += 20 * clamp01(-dPot / 30);
    risk.push({ w: -dPot + lostC.length * 8, t: "Harder to farm", d: `Crop potential ${s0.pot.toFixed(0)} → ${s1.pot.toFixed(0)} out of 100${lostC.length ? `. No longer viable: ${cropNames(lostC)}` : ""}` });
  }
  // growing season
  const dGs = c1.gs - c0.gs;
  if (dGs >= 9) {
    O += 20 * clamp01(dGs / 60);
    opp.push({ w: dGs / 3, t: `Growing season ${dGs} days longer`, d: `${c0.gs} → ${c1.gs} days a year with mean temperature above 5 °C` });
  }
  // heating
  if (c0.hdd > 500) {
    const f = (c0.hdd - c1.hdd) / c0.hdd;
    if (f >= 0.08) {
      O += 15 * clamp01(f / 0.5) * clamp01(c0.hdd / 2500);
      opp.push({ w: f * 40, t: `Heating demand ${Math.round(f * 100)}% lower`, d: "Milder winters mean lower heating bills and fewer cold-weather deaths" });
    }
  }
  // permafrost
  const pfDrop = e.kind === "country" ? (c0.pfShare - c1.pfShare) * 3 : c0.pf - c1.pf;
  if (pfDrop >= 0.15) {
    O += 10 * clamp01(pfDrop / 3);
    R += 8 * clamp01(pfDrop / 1.5);
    const d = e.kind === "country" ? `Permafrost climate shrinks from ${Math.round(c0.pfShare * 100)}% to ${Math.round(c1.pfShare * 100)}% of the land` : `${PF_NAMES[c0.pf]} → ${PF_NAMES[c1.pf].toLowerCase()} permafrost conditions`;
    opp.push({ w: 12, t: "Permafrost climate retreats", d: `${d}. Over decades, thawed ground can open for building and farming` });
    risk.push({ w: 14, t: "Ground thaw and subsidence", d: "Thawing permafrost buckles roads, pipelines and foundations and releases stored carbon" });
  }
  // Arctic shipping
  if (m.ship != null && m.ship - m0.ship >= 0.5) {
    O += 10 * clamp01((m.ship - m0.ship) / 6);
    opp.push({ w: (m.ship - m0.ship) * 3, t: `Arctic sea routes open ~${m.ship.toFixed(0)} months a year`, d: `Up from about ${m0.ship.toFixed(0)} today as sea ice retreats. Shorter Europe–Asia shipping, new ports` });
  }
  // rainfall
  if (c0.Pann < 600 && m.rain >= 5) {
    O += 15 * clamp01(m.rain / 20);
    opp.push({ w: m.rain / 2, t: `${m.rain.toFixed(0)}% more rain in a dry climate`, d: `${c0.Pann.toFixed(0)} → ${c1.Pann.toFixed(0)} mm a year` });
  }
  // ---- risks
  R += 30 * clamp01((m.dT - 1) / 7);
  const every = m.heat50 >= 49.5 ? "every year" : `every ${(50 / m.heat50).toFixed(50 / m.heat50 < 10 ? 1 : 0)} years`;
  risk.push({ w: m.heat50 / 2, t: `Once-in-50-year heat now ${every}`, d: `${m.heat50.toFixed(0)}× the pre-industrial odds, and ${m.heatI.toFixed(1)} °C hotter when it hits` });
  const dCdd = c1.cdd - c0.cdd;
  if (dCdd >= 80) {
    R += 10 * clamp01(dCdd / 1500);
    risk.push({ w: dCdd / 60, t: `Cooling demand +${Math.round(dCdd)} degree-days`, d: `${Math.round(c0.cdd)} → ${Math.round(c1.cdd)} a year. More air conditioning, more strain on power grids` });
  }
  if (["A", "Cfa", "Cwa"].some(p => c1.kg.startsWith(p)) && c1.txHot >= 35) {
    R += 10;
    risk.push({ w: 25, t: "Dangerous humid heat", d: `Hottest-month afternoons average ${c1.txHot.toFixed(0)} °C in a humid climate, near the limit for outdoor work` });
  }
  if (m.drought) {
    R += 15 * clamp01((m.drought - 1) / 4);
    risk.push({ w: m.drought * 4, t: `Droughts ${m.drought.toFixed(1)}× as frequent`, d: `Drying region. Rainfall ${m.rain >= 0 ? "+" : "−"}${Math.abs(m.rain).toFixed(0)}% vs today` });
  } else if (m.rain <= -5) {
    R += 15 * clamp01((-m.rain - 5) / 25);
    risk.push({ w: -m.rain / 2, t: `Rainfall down ${Math.abs(m.rain).toFixed(0)}%`, d: `${c0.Pann.toFixed(0)} → ${c1.Pann.toFixed(0)} mm a year` });
  }
  if (m.rainF >= 1.6) risk.push({ w: m.rainF * 3, t: `Extreme downpours ${m.rainF.toFixed(1)}× as frequent`, d: `The heaviest days drop ${m.rainI.toFixed(0)}% more rain. Flash-flood risk rises` });
  if (m.slr != null) {
    R += 15 * clamp01(m.slr / 1.5) * (e.coastShare ?? 1);
    risk.push({ w: m.slr * 20, t: `Sea level +${(m.slr * 100).toFixed(0)} cm`, d: "Relative to 1995–2014. Storm surges reach further inland" });
  }
  if ((c1.kg[0] === "D" || c1.kg[1] === "s" || c1.kg.startsWith("BS")) && c1.txHot - c0.txHot >= 2 && m.rain < 5) {
    R += 5;
    risk.push({ w: 10, t: "Longer wildfire season", d: `Summer highs ${c0.txHot.toFixed(0)} → ${c1.txHot.toFixed(0)} °C without matching rainfall` });
  }
  if (dPot >= 10 && /^(D.[cd]|ET)$/.test(c0.kg)) {
    risk.push({ w: 9, t: "Frontier farmland has a cost", d: "New fields would replace boreal forest and peat, releasing carbon. Northern soils are often thin and acidic (not modeled)" });
  }
  opp.sort((a, b) => b.w - a.w); risk.sort((a, b) => b.w - a.w);
  O = Math.min(100, O); R = Math.min(100, R);
  const o = { opp, risk, O, R, net: O - R, dPot, newC, lostC };
  s1.o = o;
  return o;
}

/* ---- Climate twins (contemporary analogs, Fitzpatrick & Dunn 2019) ---- */
let TW = null;
function vecOf(cl, lat, sdT, sdP) {
  const v = new Float32Array(24), sh = lat < 0 ? 6 : 0;
  for (let m = 0; m < 12; m++) { const k = (m + sh) % 12; v[m] = cl.ta[k] / sdT; v[12 + m] = Math.sqrt(cl.pr[k]) / sdP; }
  return v;
}
function buildTwins(regions) {
  const rs = regions.filter(r => r.b);
  const cls = rs.map(r => today(r).cl);
  let st = 0, st2 = 0, sp = 0, sp2 = 0, n = 0;
  cls.forEach(c => { for (let m = 0; m < 12; m++) { st += c.ta[m]; st2 += c.ta[m] ** 2; const q = Math.sqrt(c.pr[m]); sp += q; sp2 += q * q; n++; } });
  const sdT = Math.sqrt(st2 / n - (st / n) ** 2), sdP = Math.sqrt(sp2 / n - (sp / n) ** 2);
  const vecs = rs.map((r, i) => vecOf(cls[i], r.lat, sdT, sdP));
  TW = { rs, vecs, sdT, sdP };
  // calibrate: nearest-neighbour distances among today's climates
  const nn = [];
  for (let i = 0; i < rs.length; i += 11) { let b = 1e9; for (let j = 0; j < rs.length; j++) if (j !== i) { const d = dist(vecs[i], vecs[j]); if (d < b) b = d; } nn.push(b); }
  nn.sort((a, b) => a - b);
  TW.q50 = nn[Math.floor(nn.length * .5)]; TW.q90 = nn[Math.floor(nn.length * .9)]; TW.q99 = nn[Math.floor(nn.length * .99)];
}
function dist(a, b) { let s = 0; for (let k = 0; k < 24; k++) { const d = a[k] - b[k]; s += d * d; } return Math.sqrt(s / 24); }
function twins(e, cl, n) {
  if (!TW) return null;
  const v = vecOf(cl, e.lat, TW.sdT, TW.sdP), best = [];
  for (let i = 0; i < TW.rs.length; i++) {
    const r = TW.rs[i]; if (r === e) continue;
    const d = dist(v, TW.vecs[i]);
    if (best.length < 40 || d < best[best.length - 1].d) { best.push({ r, d }); best.sort((a, b) => a.d - b.d); if (best.length > 40) best.pop(); }
  }
  const out = [], seen = new Set();
  for (const b of best) { const k = b.r.a3; if (seen.has(k)) continue; seen.add(k); out.push(b); if (out.length >= n) break; }
  out.forEach(o => { o.q = o.d <= TW.q50 ? "close" : o.d <= TW.q90 ? "fair" : "loose"; });
  return { list: out, novel: out.length && out[0].d > TW.q99 };
}

window.Model = { Y0, Y1, NOW, GT, SLR, T_NOW, KG, KG_GROUP, landscape, CROPS, PF_NAMES, initRegion, initCountry, snap, today, outlook, buildTwins, twins, patternFactor, precipSens };
})();
