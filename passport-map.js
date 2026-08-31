/* PassportMap — dependency-free globe component (vanilla twin of @booga/passport-map).
 *
 *   new PassportMap(container, {
 *     passport: "UKR",
 *     modes: ["visa", "tax"],
 *     showHeader: true,
 *     dataBaseUrl: "https://passport.booga.me/data/",   // optional override
 *     onSelectCountry: (iso3, requirement) => {},
 *   })
 *
 * Requires maplibre-gl to be loaded on the page.
 */
(function () {
  const DEFAULT_DATA = "https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/";
  const SHAPES_URL = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";
  const TAX_URL = "https://api.worldbank.org/v2/country/all/indicator/GC.TAX.TOTL.GD.ZS?format=json&per_page=500&mrnev=1";

  const CATS = {
    home:            { color: "#0a84ff", label: "Your passport" },
    "visa free":     { color: "#30d158", label: "Visa-free" },
    "visa on arrival": { color: "#66d4cf", label: "Visa on arrival" },
    eta:             { color: "#5ac8fa", label: "Electronic travel auth." },
    "e-visa":        { color: "#ffd60a", label: "e-Visa" },
    "visa required": { color: "#ff9f0a", label: "Visa required" },
    "no admission":  { color: "#ff453a", label: "No admission" },
  };
  const OPEN_CATS = ["visa free", "visa on arrival", "eta"];

  const TAX_RAMP = [[5, "#30d158"], [12, "#ffd60a"], [20, "#ff9f0a"], [30, "#ff453a"]];

  function classify(req) {
    if (req === "-1") return { cat: "home", label: "Citizen / home country" };
    if (/^\d+$/.test(req)) return { cat: "visa free", label: `Visa-free · up to ${req} days` };
    if (CATS[req]) return { cat: req, label: CATS[req].label };
    return { cat: "visa required", label: req }; // unknown values counted conservatively
  }

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }

  class PassportMap {
    constructor(container, opts = {}) {
      this.el = typeof container === "string" ? document.querySelector(container) : container;
      this.passport = opts.passport || "UKR";
      this.modes = opts.modes || ["visa"];
      this.mode = this.modes[0];
      this.showHeader = opts.showHeader !== false;
      this.dataBaseUrl = opts.dataBaseUrl || DEFAULT_DATA;
      this.onSelectCountry = opts.onSelectCountry || null;
      this.onReady = opts.onReady || null;
      this._init().catch((e) => this._status(`Data unreachable — ${e.message}`));
    }

    /* ---------- boot ---------- */

    async _init() {
      this.el.classList.add("pm");
      this.el.innerHTML = `
        ${this.showHeader ? `<div class="pm-header"><span class="pm-title">Passport</span><span class="pm-sub">where a passport can take you</span></div>` : ""}
        <div class="pm-controls">
          <select class="pm-passport" aria-label="Passport"></select>
          ${this.modes.length > 1 ? `<div class="pm-modes">${this.modes.map((m) => `<button data-mode="${m}">${m === "visa" ? "Visa" : "Tax"}</button>`).join("")}</div>` : ""}
        </div>
        <div class="pm-map"></div>
        <div class="pm-panel">
          <div class="pm-status">Loading world…</div>
          <div class="pm-summary"></div>
          <div class="pm-legend"></div>
        </div>`;

      // data first (shapes drive both the map and the picker)
      const [shapes, csv] = await Promise.all([
        getJSON(SHAPES_URL),
        fetch(this.dataBaseUrl + "passport-index-tidy-iso3.csv").then((r) => {
          if (!r.ok) throw new Error(`visa data ${r.status}`);
          return r.text();
        }),
      ]);
      this.shapes = shapes;
      this.names = {};
      for (const f of shapes.features) this.names[f.id] = f.properties.name;

      this.visa = {}; // passport → {dest: requirement}
      for (const line of csv.split("\n").slice(1)) {
        const [p, d, req] = line.trim().split(",");
        if (!p || !d) continue;
        (this.visa[p] ??= {})[d] = req;
      }

      this._buildPicker();
      this._bindModes();
      await this._buildMap();
      this.render();
      if (this.onReady) this.onReady(this);
    }

    _buildPicker() {
      const sel = this.el.querySelector(".pm-passport");
      const opts = Object.keys(this.visa)
        .filter((c) => this.names[c])
        .sort((a, b) => this.names[a].localeCompare(this.names[b]))
        .map((c) => `<option value="${c}"${c === this.passport ? " selected" : ""}>${this.names[c]}</option>`);
      sel.innerHTML = opts.join("");
      sel.addEventListener("change", () => {
        this.passport = sel.value;
        this.render();
      });
    }

    _bindModes() {
      this.el.querySelectorAll(".pm-modes button").forEach((b) =>
        b.addEventListener("click", () => {
          this.mode = b.dataset.mode;
          this.render();
        })
      );
    }

    async _buildMap() {
      const map = new maplibregl.Map({
        container: this.el.querySelector(".pm-map"),
        style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
        center: [20, 30],
        zoom: 1.4,
        attributionControl: { compact: true },
      });
      this.map = map;
      await new Promise((res) => map.on("style.load", res));
      map.setProjection({ type: "globe" });
      new ResizeObserver(() => map.resize()).observe(this.el.querySelector(".pm-map"));

      map.addSource("pm", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "pm",
        type: "fill",
        source: "pm",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.72 },
      });
      map.addLayer({
        id: "pm-line",
        type: "line",
        source: "pm",
        paint: { "line-color": "#0b0b0d", "line-width": 0.5, "line-opacity": 0.6 },
      });

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      map.on("mousemove", "pm", (e) => {
        const p = e.features[0].properties;
        map.getCanvas().style.cursor = "pointer";
        popup.setLngLat(e.lngLat).setHTML(`<b>${p.name}</b><br>${p.detail}`).addTo(map);
      });
      map.on("mouseleave", "pm", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", "pm", (e) => {
        const p = e.features[0].properties;
        if (this.onSelectCountry) this.onSelectCountry(p.iso3, p.req);
      });
    }

    _status(msg) {
      const s = this.el.querySelector(".pm-status");
      if (s) s.textContent = msg;
    }

    /* ---------- rendering ---------- */

    async render() {
      this._status("");
      this.el.querySelectorAll(".pm-modes button").forEach((b) =>
        b.classList.toggle("active", b.dataset.mode === this.mode)
      );
      if (this.mode === "tax") return this._renderTax();
      this._renderVisa();
    }

    _renderVisa() {
      const reqs = this.visa[this.passport] || {};
      const counts = {};
      const features = [];
      for (const f of this.shapes.features) {
        let req = reqs[f.id];
        let info;
        if (f.id === this.passport) info = classify("-1");
        else if (req == null) continue;
        else info = classify(req);
        counts[info.cat] = (counts[info.cat] || 0) + 1;
        features.push({
          ...f,
          properties: {
            name: f.properties.name,
            iso3: f.id,
            req: req ?? "-1",
            detail: info.label,
            color: CATS[info.cat].color,
          },
        });
      }
      this.map.getSource("pm").setData({ type: "FeatureCollection", features });

      const open = OPEN_CATS.reduce((n, c) => n + (counts[c] || 0), 0);
      const total = features.length - 1;
      this.el.querySelector(".pm-summary").innerHTML =
        `<b>${this.names[this.passport]}</b> passport — <b>${open}</b> of ${total} destinations without a pre-arranged visa`;
      this.el.querySelector(".pm-legend").innerHTML = Object.entries(CATS)
        .filter(([cat]) => counts[cat])
        .map(([cat, c]) => `<span class="pm-key"><i style="background:${c.color}"></i>${c.label} · ${counts[cat]}</span>`)
        .join("");
    }

    async _renderTax() {
      if (!this.tax) {
        this._status("Loading tax data…");
        const data = await getJSON(TAX_URL);
        this.tax = {};
        for (const r of data[1] || []) {
          if (r.countryiso3code && r.value != null)
            this.tax[r.countryiso3code] = { value: r.value, year: r.date };
        }
        this._status("");
      }
      const ramp = TAX_RAMP;
      const color = (v) => {
        let c = ramp[0][1];
        for (const [stop, col] of ramp) if (v >= stop) c = col;
        return c;
      };
      const features = [];
      for (const f of this.shapes.features) {
        const t = this.tax[f.id];
        if (!t) continue;
        features.push({
          ...f,
          properties: {
            name: f.properties.name,
            iso3: f.id,
            req: `tax:${t.value}`,
            detail: `Tax revenue ${t.value.toFixed(1)}% of GDP (${t.year})`,
            color: color(t.value),
          },
        });
      }
      this.map.getSource("pm").setData({ type: "FeatureCollection", features });
      this.el.querySelector(".pm-summary").innerHTML =
        `Tax revenue, % of GDP — World Bank`;
      this.el.querySelector(".pm-legend").innerHTML = TAX_RAMP
        .map(([stop, col]) => `<span class="pm-key"><i style="background:${col}"></i>${stop}%+</span>`)
        .join("");
    }
  }

  window.PassportMap = PassportMap;
})();
