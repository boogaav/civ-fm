/* CIV FM — Radio channel (108.0)
   Real stations you can tune into, country by country. Directory: Radio Browser
   (radio-browser.info), a community database with an open, CORS-enabled API.
   The player lives in the HERE panel and keeps playing while you browse the
   other channels. Only HTTPS streams are listed: a browser refuses to play a
   plain-http stream on an https page. */

const RADIO = {
  // mirrors of the same database; the first one that answers is remembered
  servers: ["https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info", "https://all.api.radio-browser.info"],
  si: 0,
  counts: null,   // {ISO3: {value}}
  byCc: {},       // ISO2 → station list
  list: [],       // list on screen, used by "next"
  now: null,      // station on the player
  status: "idle", // idle | tuning | on | paused | dead
  audio: null, hls: null, token: 0, watchdog: null,
};

const RADIO_RAMP = [[0, "#2a1420"], [1, "#5c1f3a"], [2, "#a52a55"], [3, "#ff375f"], [3.8, "#ffb3c4"]]; // log10 stations
const RADIO_NEWS = /news|talk|information|public radio|current affairs|politic/i;

const rEsc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function rbJSON(path, timeoutMs = 15000) {
  let lastErr;
  for (let i = 0; i < RADIO.servers.length; i++) {
    const idx = (RADIO.si + i) % RADIO.servers.length;
    try {
      const d = await getJSON(RADIO.servers[idx] + path, timeoutMs);
      RADIO.si = idx;
      return d;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function loadRadioCounts() {
  if (RADIO.counts) return RADIO.counts;
  const [rows, facts] = await Promise.all([rbJSON("/json/countries?hidebroken=true"), loadFacts()]);
  const out = {};
  for (const r of rows) {
    const c = facts.by2[(r.iso_3166_1 || "").toUpperCase()];
    if (c && r.stationcount > 0) out[c.cca3] = { value: r.stationcount };
  }
  RADIO.counts = out;
  return out;
}

async function loadStations(cc) {
  if (RADIO.byCc[cc]) return RADIO.byCc[cc];
  const rows = await rbJSON(
    `/json/stations/search?countrycode=${cc}&hidebroken=true&is_https=true&order=clickcount&reverse=true&limit=100`
  );
  const seen = new Set();
  const list = [];
  for (const s of rows) {
    const url = s.url_resolved || s.url || "";
    const name = (s.name || "").trim();
    if (!/^https:\/\//i.test(url) || !name || seen.has(url)) continue;
    seen.add(url);
    list.push({
      id: s.stationuuid, name, url, cc,
      hls: !!s.hls || /\.m3u8(\?|$)/i.test(url),
      tags: (s.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      place: /choose/i.test(s.state || "") ? "" : (s.state || "").trim(),
      lang: (s.language || "").split(",")[0].trim(),
      bitrate: s.bitrate || 0,
      trend: s.clicktrend || 0,
    });
  }
  RADIO.byCc[cc] = list;
  return list;
}

/* ---------------- player ---------------- */

function radioEnsureStrip() {
  let strip = $("#radio-now");
  if (strip) return strip;
  strip = document.createElement("div");
  strip.id = "radio-now";
  strip.className = "hidden";
  strip.innerHTML =
    `<button id="rn-toggle" aria-label="Play or stop"></button>` +
    `<div class="rn-text"><b id="rn-name"></b><span id="rn-sub"></span></div>` +
    `<button id="rn-next" aria-label="Next station" title="Next station">` +
    `<svg viewBox="0 0 12 12"><path d="M1 1.5v9l6-4.5zM8.5 1.5h2v9h-2z"/></svg></button>` +
    `<button id="rn-close" aria-label="Turn radio off" title="Turn radio off">` +
    `<svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg></button>`;
  $("#here-panel").insertBefore(strip, $("#here-panel").firstChild);
  $("#rn-toggle").addEventListener("click", () => {
    if (!RADIO.now) return;
    if (RADIO.status === "on" || RADIO.status === "tuning") radioPause();
    else radioPlay(RADIO.now);
  });
  $("#rn-next").addEventListener("click", radioNext);
  $("#rn-close").addEventListener("click", radioOff);
  return strip;
}

const RN_ICON = {
  play: `<svg viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z"/></svg>`,
  stop: `<svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" rx="1"/></svg>`,
  eq: `<span class="rn-eq"><i></i><i></i><i></i></span>`,
};

function radioUI() {
  const strip = radioEnsureStrip();
  const st = RADIO.now;
  strip.classList.toggle("hidden", !st);
  strip.dataset.status = RADIO.status;
  if (st) {
    $("#rn-name").textContent = st.name;
    const country = state.cache.facts?.by2[st.cc]?.name.common || st.cc;
    $("#rn-sub").textContent =
      RADIO.status === "tuning" ? `Tuning in · ${country}`
      : RADIO.status === "dead" ? "No signal. Try another station."
      : RADIO.status === "paused" ? `Stopped · ${country}`
      : `On air · ${country}`;
    $("#rn-toggle").innerHTML = RADIO.status === "on" || RADIO.status === "tuning" ? RN_ICON.stop : RN_ICON.play;
  }
  document.querySelectorAll(".rlist li").forEach((li) => {
    const mine = st && li.dataset.id === st.id;
    li.classList.toggle("on", !!mine && RADIO.status !== "dead" && RADIO.status !== "paused");
    li.classList.toggle("dead", !!RADIO.dead?.has(li.dataset.id));
    const ic = li.querySelector(".ri");
    if (ic) ic.innerHTML = mine && RADIO.status === "on" ? RN_ICON.eq : RN_ICON.play;
  });
}

function radioRelease() {
  clearTimeout(RADIO.watchdog);
  if (RADIO.hls) { try { RADIO.hls.destroy(); } catch (e) {} RADIO.hls = null; }
  const a = RADIO.audio;
  if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
}

function radioPause() {
  RADIO.token++;
  radioRelease();
  RADIO.status = "paused";
  radioUI();
}

function radioOff() {
  RADIO.token++;
  radioRelease();
  RADIO.now = null;
  RADIO.status = "idle";
  radioUI();
}

function radioFail(token) {
  if (token !== RADIO.token) return;
  radioRelease();
  (RADIO.dead || (RADIO.dead = new Set())).add(RADIO.now.id);
  RADIO.status = "dead";
  radioUI();
}

function radioNext() {
  const list = RADIO.list.filter((s) => !RADIO.dead?.has(s.id) || s.id === RADIO.now?.id);
  if (!list.length) return;
  const i = list.findIndex((s) => s.id === RADIO.now?.id);
  const next = list[(i + 1) % list.length];
  if (next && next.id !== RADIO.now?.id) radioPlay(next);
}

// Safari plays HLS itself. Everything else goes through hls.js: Chromium now
// claims native HLS too, but its support is partial and fails on live radio.
const RADIO_NATIVE_HLS = /Apple/.test(navigator.vendor || "") && !!document.createElement("audio").canPlayType("application/vnd.apple.mpegurl");

function loadHlsLib() {
  if (window.Hls) return Promise.resolve();
  if (!RADIO.hlsLoading)
    RADIO.hlsLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/hls.js@1.5.20/dist/hls.light.min.js";
      s.onload = resolve;
      s.onerror = () => { RADIO.hlsLoading = null; reject(new Error("hls.js unreachable")); };
      document.head.appendChild(s);
    });
  return RADIO.hlsLoading;
}

async function radioPlay(st) {
  const token = ++RADIO.token;
  radioRelease();
  RADIO.now = st;
  RADIO.status = "tuning";
  radioUI();

  if (!RADIO.audio) {
    const a = (RADIO.audio = new Audio());
    a.preload = "none";
    a.addEventListener("playing", () => {
      clearTimeout(RADIO.watchdog);
      if (RADIO.status === "tuning") { RADIO.status = "on"; radioUI(); }
    });
    a.addEventListener("waiting", () => {
      if (RADIO.status === "on") { RADIO.status = "tuning"; radioUI(); }
    });
    a.addEventListener("error", () => { if (a.getAttribute("src")) radioFail(RADIO.token); });
    a.addEventListener("ended", () => radioFail(RADIO.token));
  }
  const a = RADIO.audio;
  // a station that has not produced sound in 20 s is treated as off air
  RADIO.watchdog = setTimeout(() => radioFail(token), 20000);

  try {
    if (st.hls && !RADIO_NATIVE_HLS) {
      await loadHlsLib();
      if (token !== RADIO.token) return;
      if (!window.Hls.isSupported()) throw new Error("no HLS support");
      const hls = (RADIO.hls = new window.Hls({ enableWorker: true }));
      hls.on(window.Hls.Events.ERROR, (_e, d) => { if (d.fatal) radioFail(token); });
      hls.loadSource(st.url);
      hls.attachMedia(a);
    } else {
      a.src = st.url;
    }
    await a.play();
  } catch (e) {
    // AbortError just means another station was picked while this one loaded
    if (token === RADIO.token && e.name !== "AbortError") radioFail(token);
    return;
  }
  if (token !== RADIO.token) return;

  // the directory ranks stations by listens; report this one (best effort)
  fetch(`${RADIO.servers[RADIO.si]}/json/url/${st.id}`).catch(() => {});
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: st.name, artist: state.cache.facts?.by2[st.cc]?.name.common || "", album: "CIV FM Radio",
      });
      navigator.mediaSession.setActionHandler("pause", radioPause);
      navigator.mediaSession.setActionHandler("stop", radioPause);
      navigator.mediaSession.setActionHandler("play", () => RADIO.now && radioPlay(RADIO.now));
      navigator.mediaSession.setActionHandler("nexttrack", radioNext);
    } catch (e) {}
  }
}

/* ---------------- HERE card ---------------- */

// The country under the HERE point. The coloured shape the person clicked wins,
// so the list matches what they see; small countries the shapes miss fall back
// to the reverse-geocoded country.
function radioCountryHere() {
  const h = state.here;
  if (h._radioCc === undefined) {
    h._radioCc = null;
    if (map.getLayer("choro")) {
      try {
        // rendered GeoJSON features lose their string ids, so match on the name
        const hit = map.queryRenderedFeatures(map.project([h.lng, h.lat]), { layers: ["choro"] })[0];
        const shape = hit && state.cache.shapes?.features.find((f) => f.properties.name === hit.properties.name);
        const c = shape && state.cache.facts?.by3[shape.id];
        if (c) h._radioCc = c.cca2;
      } catch (e) {}
    }
  }
  return h._radioCc || h.country?.cca2 || null;
}

function radioFilter(list) {
  const sub = state.subs.radio || "popular";
  if (sub === "news") return list.filter((s) => RADIO_NEWS.test(s.tags.join(",") + " " + s.name));
  if (sub === "rising") return [...list].sort((a, b) => b.trend - a.trend);
  return list;
}

async function hereRadio(el) {
  const cc = radioCountryHere();
  if (!cc) {
    // the first render runs before the reverse-geocode answers; the second is final
    const h = state.here;
    h._radioTries = (h._radioTries || 0) + 1;
    el.innerHTML = `<div class="here-hint">${h._radioTries > 1
      ? "No country at this point. Click a country to hear what is on the air there."
      : "Finding the country at this point…"}</div>`;
    return;
  }
  const name = state.cache.facts?.by2[cc]?.name.common || cc;
  if (!RADIO.byCc[cc]) el.innerHTML = tuningHTML;
  let all;
  try { all = await loadStations(cc); } catch (e) {
    el.innerHTML = `<div class="here-hint">The station directory is unreachable right now.</div>`;
    return;
  }
  if (state.channel !== "radio" || !el.isConnected) return;
  const list = radioFilter(all);
  RADIO.list = list;
  const sub = state.subs.radio || "popular";
  if (!list.length) {
    el.innerHTML = `<div class="here-hint">${all.length
      ? `No news or talk stations listed for ${rEsc(name)}. Try Popular.`
      : `No stations listed for ${rEsc(name)} that a browser can play.`}</div>`;
    return;
  }
  const rows = list.map((s) => {
    const meta = [s.place, s.tags.slice(0, 2).join(", "), s.bitrate ? `${s.bitrate} kbps` : ""].filter(Boolean).join(" · ");
    return `<li data-id="${rEsc(s.id)}" tabindex="0" role="button"><span class="ri"></span>` +
      `<span class="rb"><b>${rEsc(s.name)}</b>${meta ? `<span>${rEsc(meta)}</span>` : ""}</span></li>`;
  }).join("");
  el.innerHTML =
    `<div class="ro wide"><span class="k">${rEsc(name)} · ${list.length}${sub === "news" ? " news and talk" : ""} station${list.length > 1 ? "s" : ""}</span>` +
    `<ul class="rlist">${rows}</ul>` +
    `<div class="psrc">Directory: <a href="https://www.radio-browser.info/" target="_blank" rel="noopener">Radio Browser</a> · ${sub === "rising" ? "fastest growing first" : "most listened first"}</div></div>`;
  const pick = (li) => {
    const st = list.find((s) => s.id === li.dataset.id);
    if (!st) return;
    if (RADIO.now?.id === st.id && (RADIO.status === "on" || RADIO.status === "tuning")) radioPause();
    else radioPlay(st);
  };
  el.querySelectorAll(".rlist li").forEach((li) => {
    li.addEventListener("click", () => pick(li));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(li); }
    });
  });
  radioUI();
}

/* ---------------- channel ---------------- */

const RADIO_CHANNEL = {
  num: "108.0", name: "Radio",
  q: "What is on the air here right now?",
  subs: [
    { id: "popular", label: "Popular" },
    { id: "rising", label: "Rising" },
    { id: "news", label: "News" },
  ],
  async applySub(id) {
    state.subs.radio = id;
    document.querySelectorAll("#subdial button").forEach((b) => b.classList.toggle("active", b.dataset.sub === id));
    renderHere();
  },
  async activate() {
    document.body.classList.add("ch-radio");
    const counts = await loadRadioCounts();
    if (state.channel !== "radio") return;
    await addChoropleth({
      values: counts,
      ramp: RADIO_RAMP,
      input: ["log10", ["max", ["get", "value"], 1]],
      fmt: (v) => `${Number(v).toLocaleString("en")} radio station${v === 1 ? "" : "s"} online`,
      opacity: 0.6,
    });
    legend("Radio — stations streaming online", [
      { gradient: gradientCSS(RADIO_RAMP), from: "1", to: "6,000+" },
    ]);
    if (state.borders) applyBorders();
    if (!state.here) showCaption("Click a country to hear what is on the air there.");
    if (!RADIO_NATIVE_HLS) loadHlsLib().catch(() => {}); // ready before the first click
  },
  here: hereRadio,
};

// leaving the channel keeps the music, drops the tall-list layout
function radioTeardown() { document.body.classList.remove("ch-radio"); }

CHANNELS.radio = RADIO_CHANNEL;
radioEnsureStrip();
