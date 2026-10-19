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

  home: {
    what: "The region you are in, not the country average: 1,774 regions coloured by how people live there. Click anywhere for that region's numbers and how it compares with its country.",
    src: "Global Data Lab, Subnational Human Development Database, 1990 to 2019, via the Open Numbers mirror. Regions are the ones the database defines, usually provinces or states.",
  },
  "home/living": {
    what: "The Human Development Index for each region: health, schooling and income combined into one number from 0 to 1. Above 0.8 is very high, below 0.55 is low.",
    src: "Global Data Lab, Subnational HDI, 2019.",
  },
  "home/health": {
    what: "Life expectancy at birth in each region, in years. Green is longer.",
    src: "Global Data Lab, Subnational HDI, 2019.",
  },
  "home/school": {
    what: "Average years of schooling completed by adults aged 25 and over in each region. The panel adds how many years today's children can expect.",
    src: "Global Data Lab, Subnational HDI, 2019.",
  },
  "home/income": {
    what: "Gross national income per person in each region, adjusted for local prices. The scale is logarithmic: each step is ten times more.",
    src: "Global Data Lab, Subnational HDI, 2019, in 2011 international dollars.",
  },

  "home/internet": {
    what: "Measured download speed on fixed lines in each region, in megabits per second, from real speed tests. The panel adds mobile.",
    src: "Ookla Open Data, Speedtest results aggregated to 600 m tiles, latest quarter, averaged per region weighted by the number of tests.",
  },
  "home/lights": {
    what: "Earth at night. The lights show where electricity reaches people. The panel gives the share of people with electricity and with internet, and the measured internet speed in this region.",
    src: "NASA Black Marble, a cloud-free composite from the VIIRS satellite sensor (2016), served by NASA GIBS. Access figures: World Bank, indicators EG.ELC.ACCS.ZS and IT.NET.USER.ZS.",
  },

  body: {
    what: "How long people live here, and which substances the law lets you consume.",
    src: "World Bank for health. CIV FM's own curated tables for substance laws.",
  },
  "body/life": {
    what: "Life expectancy at birth, in years. Green is longer. The panel adds doctors per 1,000 people and health spending.",
    src: WB("SP.DYN.LE00.IN"),
  },
  "body/care": {
    what: "Doctors per 1,000 people in each country. Green means more physicians to go round. The panel adds health spending as a share of GDP.",
    src: "World Bank Open Data, indicator SH.MED.PHYS.ZS, latest year each country reported. Originally from the WHO.",
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


  state: {
    what: "The state you live under: how it is governed, who holds power, the constitution, and when people next vote.",
    src: "CIA World Factbook (public domain), the Constitute Project for constitution texts, and Wikidata for election dates.",
  },
  "state/system": {
    what: "How each country is governed: republic or monarchy, who holds power and how they got it. Click a country for its heads of state and government, legislature, voting age and constitution, with the full text one tap away.",
    src: "CIA World Factbook, public domain, updated through 2025. Constitution texts: Constitute Project (Comparative Constitutions Project), CC BY-NC, copied to civ.fm.",
  },
  "state/vote": {
    what: "Days until each country's next national election. Red is within a month, yellow within half a year, grey more than a year away or unknown.",
    src: "Wikidata, refreshed daily. Snap elections and dates not yet set will be missing.",
  },
  "state/parties": {
    what: "How concentrated power is in each parliament: the share of seats held by the largest party. Green is a fragmented house, red a single party holding almost everything. Click a country for every party with its logo, seats and share, and which one leads the government.",
    src: "Seats: CIA World Factbook (public domain) for most countries, else the lower house's English Wikipedia infobox. Logos and colours: Wikidata and Wikimedia Commons. Share is of the lower or single house, not of cabinet posts.",
  },
  "state/passport": {
    what: "Where one passport can go: green visa-free, teal on arrival, yellow e-visa, orange a visa in advance, red no admission. Pick the passport in the panel; it starts with the country you are in.",
    src: "Passport Index dataset (ilyankou, MIT), copied to civ.fm; visa rules change, so check before you fly.",
  },
  "state/citizenship": {
    what: "How many years you must live in a country before you can apply for citizenship by the standard route. Green is three years or less, red twenty or more.",
    src: "Compiled by hand for CIV FM from national nationality laws, snapshot of September 2026. Spouses, descent and investment routes are usually faster.",
  },
  "state/immigration": {
    what: "Who each country's immigration system is built to attract: skilled talent, investors, nomads and retirees, guest workers, diaspora, open door, family and humanitarian, or largely closed.",
    src: "Compiled by hand for CIV FM from published policy, snapshot of September 2026. Dominant approach only; most countries run several routes.",
  },
  mind: {
    what: "What people here believe, read, listen to and are doing right now.",
    src: "CIA World Factbook for religion, Wikipedia and Google Trends for reading, Radio Browser for stations, Wikimedia EventStreams for the live feed.",
  },
  "mind/faith": {
    what: "The largest religion in each country. Click one for the full breakdown as reported, grouped into families.",
    src: "CIA World Factbook, public domain; each country's latest census or survey estimate, which can be years apart.",
  },
  "mind/reading": {
    what: "What each country read most on Wikipedia yesterday. Click a country for its top ten articles and what it is searching for now.",
    src: "Wikimedia pageviews, top articles per country, for yesterday in UTC. Searches: Google Trends daily feed.",
  },
  "mind/radio": {
    what: "Real radio from every country. Brighter countries stream more stations. Click one to list its stations, then click a station to listen. Popular, Rising and News switch the list.",
    src: "Radio Browser, a free community directory, queried live. Only stations with a secure stream are listed, since browsers refuse the rest.",
  },
  "mind/signal": {
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
