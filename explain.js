/* CIV FM — explanations
   What each channel and sub-dial means and where its data comes from.
   Shown on hover or keyboard focus of a dial or sub-dial button, and by the
   "i" button beside the frequency for touch screens, which have no hover.
   Keys are "channel" or "channel/sub". Keep each entry to what a newcomer
   needs: what the colours mean, then the source and how fresh it is. */

const WB = (code) => `World Bank Open Data, indicator ${code}, latest year each country reported.`;
const CURATED = "Compiled by hand for CIV FM from national laws, snapshot of September 2026. Laws change, so check locally before you rely on it.";
const CURATED_TAX = "Compiled by hand for CIV FM from national tax codes, snapshot of September 2026. Planning summary, not tax advice.";
const FUTURE_SRC = "CIV FM's own climate emulator: IPCC AR6 warming for the SSP5-8.5 pathway, applied to WorldClim 2.1 climate normals (1970 to 2000) for 4,595 Natural Earth regions. It shows direction and rough size. It is not a forecast.";

const EXPLAIN = {
  earth: {
    what: "The physical planet right now: the weather over your head, the hazards under your feet, and the water you depend on.",
    src: "Open-Meteo, USGS, NASA, GDACS and the World Bank. See each sub-section.",
  },
  "earth/air": {
    what: "Each dot is the temperature in a major city at this moment. The shaded half of the globe is night. Click anywhere for local weather, wind, UV and air quality.",
    src: "Open-Meteo weather and air-quality models. City temperatures refresh every 10 minutes.",
  },
  "earth/ground": {
    what: "Earthquakes of the last 24 hours, plus storms, wildfires, volcanoes and floods that are active now.",
    src: "USGS earthquake feed (magnitude 2.5 and up), NASA EONET open natural events, and GDACS, the UN and EU disaster alert system. Refreshed every few minutes.",
  },
  "earth/water": {
    what: "Water stress: the share of a country's renewable freshwater that people withdraw each year. Above 25% is stressed. Above 100% means taking more than nature puts back.",
    src: WB("ER.H2O.FWST.ZS") + " Originally from FAO AQUASTAT. Local rain, soil moisture and river flow come from Open-Meteo.",
  },

  body: {
    what: "How long people live here, and which substances the law lets you consume.",
    src: "World Bank for health. CIV FM's own curated tables for substance laws.",
  },
  "body/life": {
    what: "Life expectancy at birth, in years. Green is longer. The panel adds doctors per 1,000 people and health spending.",
    src: WB("SP.DYN.LE00.IN"),
  },
  "body/cannabis": {
    what: "Whether cannabis is legal for adults, medical only, decriminalised or tolerated, illegal, or illegal with severe penalties.",
    src: CURATED,
  },
  "body/alcohol": {
    what: "Whether alcohol is legal, restricted through permits or dry regions, or banned outright.",
    src: CURATED,
  },
  "body/tobacco": {
    what: "Rules for tobacco and nicotine vapes: both legal, vapes prescription-only or tobacco sales restricted, or vapes banned.",
    src: CURATED,
  },
  "body/psychedelics": {
    what: "Legal status of psilocybin mushrooms and other natural psychedelics, from legal or unregulated to illegal with severe penalties.",
    src: CURATED,
  },
  "body/decrim": {
    what: "Where having a small amount of a drug for your own use is not a crime: for all drugs, for cannabis only, or not at all.",
    src: CURATED,
  },

  grid: {
    what: "Earth at night. The lights show where electricity reaches people. The panel gives the share of people with electricity and with internet.",
    src: "NASA Black Marble, a cloud-free composite from the VIIRS satellite sensor (2016), served by NASA GIBS. Access figures: World Bank, indicators EG.ELC.ACCS.ZS and IT.NET.USER.ZS.",
  },

  money: {
    what: "How rich a country is, what its currency is doing, how much it owes, and how much it takes in tax.",
    src: "World Bank for the economy. CIV FM's own curated tables for tax rates.",
  },
  "money/gdp": {
    what: "Economic output per person per year, adjusted for local prices (purchasing power parity), so a dollar buys the same in every country.",
    src: WB("NY.GDP.PCAP.PP.CD"),
  },
  "money/inflation": {
    what: "How much consumer prices rose over one year. Green is stable. Red means money is losing value fast.",
    src: WB("FP.CPI.TOTL.ZG"),
  },
  "money/gold": {
    what: "The dollar value of the gold held by a country's central bank. The scale is logarithmic: each step is ten times more.",
    src: "World Bank Open Data: total reserves minus reserves without gold (FI.RES.TOTL.CD and FI.RES.XGLD.CD), latest year reported.",
  },
  "money/debt": {
    what: "Central government debt as a share of what the economy produces in a year. Many countries do not report it and stay blank.",
    src: WB("GC.DOD.TOTL.GD.ZS"),
  },
  "money/income": {
    what: "The top personal income tax rate: what the highest slice of a salary is taxed at, before deductions and treaties.",
    src: CURATED_TAX,
  },
  "money/corporate": {
    what: "The headline corporate income tax rate on company profits, combined where regions add their own.",
    src: CURATED_TAX,
  },

  people: {
    what: "Who lives here, what they are reading, when they next vote, and what humanity is doing at this moment.",
    src: "World Bank, Wikipedia, Wikidata and Google Trends. See each sub-section.",
  },
  "people/density": {
    what: "People per square kilometre of land. The panel adds population, languages and the capital.",
    src: WB("EN.POP.DNST"),
  },
  "people/reading": {
    what: "What each country read most on Wikipedia yesterday. Click a country for its top ten articles and what it is searching for now.",
    src: "Wikimedia pageviews, top articles per country, for yesterday in UTC. Searches: Google Trends daily feed.",
  },
  "people/ballot": {
    what: "Days until each country's next national election. Red is within a month, yellow within half a year, grey more than a year away or unknown.",
    src: "Wikidata, refreshed daily. Snap elections and dates not yet set will be missing.",
  },
  "people/signal": {
    what: "Every flash is a person editing Wikipedia, as it happens. Also the International Space Station and the next rocket launch.",
    src: "Wikimedia EventStreams (live), wheretheiss.at for the ISS, and Launch Library for launches.",
  },

  future: {
    what: "What each region becomes over the next century if emissions stay worst-case. Drag the year bar to move through time.",
    src: FUTURE_SRC,
  },
  "future/outlook": {
    what: "The balance for each region: what warming gives it (longer seasons, new crops, less heating) minus what it takes (heat, drought, sea level). Green gains more. Red loses more.",
    src: FUTURE_SRC + " The weights are CIV FM's own, meant for comparing places.",
  },
  "future/zone": {
    what: "The climate zone each region falls into in the chosen year: tropical, arid, temperate, continental or polar.",
    src: FUTURE_SRC + " Zones follow the Köppen-Geiger rules (Beck et al. 2018).",
  },
  "future/crops": {
    what: "How well eight staple crops could grow compared with today. Green means better conditions. Red means worse.",
    src: FUTURE_SRC + " Crop limits from FAO EcoCrop. Soils and irrigation are not modelled.",
  },
  "future/warming": {
    what: "How much hotter each region is than before industry (1850 to 1900), in degrees Celsius. Land and the Arctic warm faster than the global average.",
    src: FUTURE_SRC,
  },

  radio: {
    what: "Real radio from every country. Brighter countries stream more stations. Click one to list its stations, then click a station to listen.",
    src: "Radio Browser, a free community directory, queried live. Only stations with a secure stream are listed, since browsers refuse the rest.",
  },
  "radio/popular": {
    what: "The country's stations ordered by how many people tune in.",
    src: "Radio Browser listener counts, live.",
  },
  "radio/rising": {
    what: "The country's stations ordered by how fast they are gaining listeners.",
    src: "Radio Browser click trend over the last day, live.",
  },
  "radio/news": {
    what: "Only the country's news and talk stations.",
    src: "Radio Browser, filtered by the tags and names stations give themselves.",
  },
};

/* ---------------- tooltip ---------------- */

const EX = { tip: null, timer: null, pinned: false };

function explainTitle(key) {
  const [ch, sub] = key.split("/");
  const def = CHANNELS[ch];
  if (!def) return "";
  const s = sub && (def.subs || []).find((x) => x.id === sub);
  return s ? `${def.name} › ${s.label}` : def.name;
}

function explainShow(anchor, key, place) {
  const e = EXPLAIN[key];
  if (!e) return explainHide();
  if (!EX.tip) {
    EX.tip = document.createElement("div");
    EX.tip.id = "explain";
    EX.tip.setAttribute("role", "tooltip");
    document.body.appendChild(EX.tip);
  }
  const tip = EX.tip;
  tip.innerHTML =
    `<b>${explainTitle(key)}</b><p>${e.what}</p><p class="ex-src"><span>Data</span>${e.src}</p>`;
  tip.classList.add("show");
  const r = anchor.getBoundingClientRect(), t = tip.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const x = Math.max(12, Math.min(r.left + r.width / 2 - t.width / 2, vw - t.width - 12));
  // below means below the whole sub-dial: it wraps to two rows on narrow
  // screens, and the card must not cover the second row
  const host = anchor.closest("#subdial");
  const bottom = host ? host.getBoundingClientRect().bottom : r.bottom;
  let y = place === "above" ? r.top - t.height - 10 : bottom + 8;
  if (y < 12) y = bottom + 8;
  if (y + t.height > vh - 12) y = Math.max(12, r.top - t.height - 10);
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
}

function explainHide() {
  clearTimeout(EX.timer);
  EX.pinned = false;
  EX.tip?.classList.remove("show");
  $("#btn-explain")?.setAttribute("aria-expanded", "false");
}

const explainKeyOf = (btn) =>
  btn.dataset.ch ? btn.dataset.ch : btn.dataset.sub ? `${state.channel}/${btn.dataset.sub}` : null;

// one set of delegated listeners: the sub-dial is rebuilt on every tune
for (const [host, place] of [["#dial", "above"], ["#subdial", "below"]]) {
  const el = $(host);
  if (!el) continue;
  el.addEventListener("pointerover", (ev) => {
    if (ev.pointerType !== "mouse") return; // a tap must not leave a tooltip stuck open
    const btn = ev.target.closest("button");
    const key = btn && explainKeyOf(btn);
    if (!key) return;
    clearTimeout(EX.timer);
    EX.timer = setTimeout(() => { EX.pinned = false; explainShow(btn, key, place); }, 350);
  });
  el.addEventListener("pointerout", (ev) => {
    if (ev.pointerType !== "mouse" || EX.pinned) return;
    const btn = ev.target.closest("button");
    if (btn && btn.contains(ev.relatedTarget)) return;
    explainHide();
  });
  el.addEventListener("focusin", (ev) => {
    const btn = ev.target.closest("button");
    const key = btn && explainKeyOf(btn);
    if (key && btn.matches(":focus-visible")) explainShow(btn, key, place);
  });
  el.addEventListener("focusout", () => { if (!EX.pinned) explainHide(); });
}

// touch screens: an "i" beside the frequency explains what is tuned now
(function addExplainButton() {
  const row = $(".freq-readout");
  if (!row || $("#btn-explain")) return;
  const b = document.createElement("button");
  b.id = "btn-explain";
  b.type = "button";
  b.textContent = "i";
  b.setAttribute("aria-label", "What is this, and where does the data come from?");
  b.setAttribute("aria-expanded", "false");
  row.appendChild(b);
  b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (EX.pinned) return explainHide();
    const def = CHANNELS[state.channel];
    if (!def) return;
    const sub = def.subs && (state.subs[state.channel] || def.subs[0].id);
    const key = sub && EXPLAIN[`${state.channel}/${sub}`] ? `${state.channel}/${sub}` : state.channel;
    explainShow($("#subdial").classList.contains("hidden") ? row : $("#subdial"), key, "below");
    EX.pinned = true;
    b.setAttribute("aria-expanded", "true");
  });
  // any other tap, or Escape, closes it; tapping a sub-dial button re-tunes first
  document.addEventListener("click", () => { if (EX.pinned) explainHide(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") explainHide(); });
})();
