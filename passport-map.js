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
  // Country shapes and the visa matrix are served from this site's own
  // vendor/ folder (see vendor/README.md), resolved next to this script so
  // the component works from any page depth. They used to load from
  // raw.githubusercontent.com, which some ISPs and countries block outright —
  // the page then died with "Failed to fetch".
  const HERE = new URL(".", document.currentScript.src).href;
  const DEFAULT_DATA = HERE + "vendor/";
  const SHAPES_URL = HERE + "vendor/countries.geo.json";
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


  // Curated naturalisation snapshot, mid-2026: ISO3 → [years, note, dual].
  // years = standard residence requirement before applying (ordinary route,
  // no marriage/descent/investment shortcuts). dual: "yes" | "no" | "limited".
  // Planning summary, not legal advice — rules change and real timelines run longer.
  const NATURALIZATION = {
    updated: "2026-09",
    data: {
      ARG: [2, "2 years' residence; among the fastest in the world", "yes"],
      PER: [2, "2 years of legal residence", "yes"],
      DOM: [2, "2 years after permanent residence", "yes"],
      BOL: [3, "3 years (2 with Bolivian spouse or child)", "yes"],
      PRY: [3, "3 years of permanent residence", "limited"],
      ECU: [3, "3 years of legal residence", "yes"],
      HND: [3, "3 years (less for Central Americans and Spaniards)", "limited"],
      URY: [5, "5 years (3 for families); grants 'legal citizenship'", "yes"],
      BRA: [4, "4 years; 1 with Brazilian spouse/child or for Portuguese speakers", "yes"],
      CAN: [3, "1,095 days within the last 5 years as a permanent resident", "yes"],
      AUS: [4, "4 years incl. 1 as permanent resident", "yes"],
      NZL: [5, "5 years as a resident", "yes"],
      USA: [5, "5 years as green-card holder (3 if married to a citizen)", "yes"],
      MEX: [5, "5 years; 2 for Latin American/Iberian nationals or spouses", "yes"],
      CHL: [5, "5 years of residence", "yes"],
      COL: [5, "5 years; 1–2 for Latin Americans and Spaniards", "yes"],
      PAN: [5, "5 years after permanent residence", "limited"],
      CRI: [7, "7 years; 5 for Central Americans, Spaniards, Ibero-Americans", "yes"],
      VEN: [10, "10 years; 5 for Latin Americans and Spaniards", "yes"],
      JAM: [5, "5 years of residence", "yes"],
      GBR: [6, "5 years to settlement + 1 more; longer settlement route proposed", "yes"],
      IRL: [5, "5 years of reckonable residence in the last 9", "yes"],
      FRA: [5, "5 years; 2 after French higher-education degree", "yes"],
      BEL: [5, "5 years with integration and economic participation", "yes"],
      NLD: [5, "5 years; renunciation usually required; increase to 10 proposed", "limited"],
      LUX: [5, "5 years plus language test (Luxembourgish)", "yes"],
      DEU: [5, "5 years since the 2024 reform (3-year fast track abolished 2025)", "yes"],
      PRT: [5, "5 years; law raising this to 10 (7 for Portuguese speakers) contested in 2025–26", "yes"],
      SWE: [5, "5 years; increase to 8 planned", "yes"],
      FIN: [8, "8 years since October 2024 (was 5)", "yes"],
      NOR: [8, "8 of the last 11 years", "yes"],
      DNK: [9, "9 years plus strict tests and self-support record", "yes"],
      ISL: [7, "7 years (4 for Nordic citizens)", "yes"],
      ESP: [10, "10 years; 2 for Ibero-American, Filipino, Andorran, Portuguese, Sephardic nationals", "limited"],
      ITA: [10, "10 years (4 for EU citizens); 2025 referendum to cut to 5 failed", "yes"],
      AUT: [10, "10 years (6 with strong integration); renunciation required", "no"],
      CHE: [10, "10 years incl. cantonal and communal requirements", "yes"],
      GRC: [7, "7 years plus exam", "yes"],
      MLT: [5, "5 years; highly discretionary in practice", "yes"],
      CYP: [7, "7 of the last 10 years (4–5 for highly skilled)", "yes"],
      POL: [3, "3 years on permanent residence (≈8–10 in total)", "yes"],
      CZE: [10, "5 years of permanent residence, typically ~10 in total", "yes"],
      SVK: [8, "8 years of permanent residence", "limited"],
      HUN: [8, "8 years; simplified route for ethnic Hungarians", "yes"],
      SVN: [10, "10 years incl. 5 continuous; renunciation usually required", "limited"],
      HRV: [8, "8 years plus language and culture test", "yes"],
      ROU: [8, "8 years (5 if married to a Romanian)", "yes"],
      BGR: [5, "5 years after permanent residence (~10 in total)", "limited"],
      EST: [8, "8 years incl. 5 permanent; renunciation required", "no"],
      LVA: [10, "5 years of permanent residence after 5 temporary", "limited"],
      LTU: [10, "10 years; renunciation required", "no"],
      SRB: [3, "3 years of permanent residence", "yes"],
      MNE: [10, "10 years; renunciation required", "no"],
      MKD: [8, "8 years of continuous residence", "yes"],
      ALB: [7, "7 years of residence", "yes"],
      BIH: [8, "8 years; renunciation unless treaty", "limited"],
      UKR: [5, "5 years; multiple citizenship law adopted 2025", "limited"],
      BLR: [5, "5 years of permanent residence", "no"],
      RUS: [5, "5 years on a residence permit", "limited"],
      GEO: [10, "10 years; dual only by presidential exception", "limited"],
      ARM: [3, "3 years; fast for ethnic Armenians", "yes"],
      AZE: [5, "5 years; dual not recognised", "no"],
      TUR: [5, "5 years of continuous residence", "yes"],
      ISR: [3, "3 of the last 5 years; immediate under the Law of Return", "yes"],
      KAZ: [5, "5 years; dual prohibited", "no"],
      UZB: [5, "5 years; dual not recognised", "no"],
      KGZ: [5, "5 years", "limited"],
      MNG: [5, "5 years; renunciation required", "no"],
      JPN: [5, "5 years; tightening under discussion; renunciation required", "no"],
      KOR: [5, "5 years; dual only in limited cases", "limited"],
      TWN: [5, "5 years; renunciation required (exceptions for high-skilled)", "limited"],
      HKG: [7, "7 years to permanent residency (right of abode)", "limited"],
      SGP: [2, "2+ years as PR, highly discretionary (≈6–10 in total); renunciation required", "no"],
      MYS: [10, "10 of the last 12 years; rarely granted", "no"],
      THA: [5, "5 years on PR or work permits; ≈10 in practice", "limited"],
      VNM: [5, "5 years; renunciation usually required", "limited"],
      PHL: [10, "10 years (5 in special cases)", "yes"],
      IDN: [5, "5 consecutive or 10 non-consecutive years; renunciation required", "no"],
      IND: [12, "11 of the last 14 years + 12 months; renunciation required", "no"],
      PAK: [5, "4 of 7 years + 12 months", "limited"],
      BGD: [5, "5 years", "limited"],
      LKA: [5, "5 years", "limited"],
      NPL: [15, "15 years; renunciation required", "no"],
      BTN: [20, "20 years (15 for government employees)", "no"],
      MDV: [12, "12 years; must be Muslim", "no"],
      KHM: [7, "7 years", "yes"],
      LAO: [10, "10 years; renunciation required", "no"],
      BRN: [20, "10–20 years depending on route", "no"],
      CHN: [99, "No practical route; naturalisation is extremely rare", "no"],
      IRN: [5, "5 years", "no"],
      IRQ: [10, "10 years", "yes"],
      JOR: [15, "15 years (4 for Arab nationals)", "yes"],
      SAU: [10, "10 years, points-based and rare", "no"],
      ARE: [30, "30 years, or by nomination for exceptional talent", "limited"],
      QAT: [25, "25 years; capped numbers", "no"],
      KWT: [20, "20 years (15 for Arab nationals); must be Muslim", "no"],
      BHR: [25, "25 years (15 for Arab nationals)", "limited"],
      OMN: [15, "15 years under the 2025 law", "no"],
      EGY: [10, "10 years", "yes"],
      MAR: [5, "5 years", "yes"],
      DZA: [7, "7 years", "yes"],
      TUN: [5, "5 years", "yes"],
      ZAF: [10, "5 years after permanent residence (~10 in total)", "limited"],
      NGA: [15, "15 years", "limited"],
      KEN: [7, "7 years", "yes"],
      ETH: [4, "4 years; renunciation required", "no"],
      GHA: [6, "~6 years", "yes"],
      TZA: [8, "~8 years; renunciation required", "no"],
      MCO: [10, "10 years; renunciation required, sovereign's discretion", "no"],
      AND: [20, "20 years (10 if educated in Andorra); renunciation required", "no"],
      LIE: [30, "30 years (years under age 20 count double) or community vote after 10", "limited"],
    },
  };


  // Curated immigration-policy snapshot, mid-2026: ISO3 → [approach, who, why].
  // approach = the dominant thing a country's immigration system is built to
  // attract; most countries run several routes, so "who" names the others.
  // A reading of published policy, not legal advice — rules shift every year.
  const IMM_APPROACH = {
    talent:    ["#0a84ff", "Skilled talent"],
    capital:   ["#ffd60a", "Investors & wealth"],
    lifestyle: ["#66d4cf", "Nomads & retirees"],
    labour:    ["#ff9f0a", "Guest workers"],
    diaspora:  ["#bf5af2", "Diaspora & kin"],
    open:      ["#30d158", "Open door"],
    family:    ["#ff6482", "Family & humanitarian"],
    closed:    ["#636366", "Largely closed"],
  };
  const IMMIGRATION = {
    updated: "2026-09",
    data: {
      // — skilled talent —
      CAN: ["talent", "Skilled workers ranked by Express Entry points; students; French speakers", "Ageing population and labour shortages — though targets were cut for 2025–27 after housing strain"],
      AUS: ["talent", "Skilled workers on points-tested visas; international students", "Fill skill shortages in a small workforce; student route tightened since 2024"],
      NZL: ["talent", "Skilled residents on the Green List; active investors", "Small workforce and a steady brain drain to Australia"],
      GBR: ["talent", "Workers above a salary threshold, health staff, Global Talent", "Post-Brexit points system; 2025 reforms raise thresholds to cut net migration"],
      DEU: ["talent", "Skilled workers via the Opportunity Card points system and EU Blue Card", "Needs roughly 400,000 workers a year as the population ages"],
      NLD: ["talent", "Highly skilled migrants on employer-sponsored permits", "Knowledge economy; expat tax break is being trimmed as politics turn restrictive"],
      IRL: ["talent", "Tech, pharma and health workers on Critical Skills permits", "Staff the multinationals that drive the economy"],
      FRA: ["talent", "Researchers, founders and executives on the Talent passport; students", "Compete for qualified workers while the 2024 law tightens other routes"],
      AUT: ["talent", "Skilled workers scored for the Red-White-Red Card", "Shortages in trades, care and engineering"],
      CHE: ["talent", "EU workers by free movement; quota-limited non-EU specialists", "High-wage economy that needs specialists but caps their number"],
      BEL: ["talent", "Highly skilled workers on the single permit", "Shortage occupations in each region"],
      LUX: ["talent", "Finance and EU-institution professionals; cross-border workers", "Nearly half the residents are already foreign; finance needs more"],
      SWE: ["talent", "Workers above a rising salary floor; researchers", "Pivot since 2022 from asylum to labour migration and paid returns"],
      DNK: ["talent", "High earners on the Pay Limit scheme; shortage-list workers", "Welcomes top earners while running Europe's strictest asylum policy"],
      NOR: ["talent", "Skilled workers with a job offer; EEA free movement", "Oil, maritime and health shortages"],
      FIN: ["talent", "Specialists, founders and students", "Workforce shrinking fast; rules for staying were tightened in 2024–25"],
      EST: ["talent", "Founders and remote workers — e-Residency, startup and nomad visas", "Tiny country building a digital economy bigger than its population"],
      SGP: ["talent", "Professionals scored under COMPASS; wealthy investors; capped work-permit labour", "City-state with no hinterland: imports both talent and labour, on separate tracks"],
      HKG: ["talent", "High earners and top-university graduates via the Top Talent Pass", "Refill the workforce after the post-2020 exodus"],
      ZAF: ["talent", "Critical-skills workers; remote workers under a 2024 points system", "Skills gap despite high unemployment; reform after years of visa backlog"],
      // — investors & wealth —
      ARE: ["capital", "Investors, founders and professionals on 10-year Golden Visas; millions of guest workers", "Diversify beyond oil — about 88% of residents are foreign, almost none will ever be citizens"],
      GRC: ["capital", "Property investors (Golden Visa from €250k–800k); digital nomads", "Capital inflow after the debt crisis; thresholds raised as housing overheated"],
      CYP: ["capital", "Property investors seeking permanent residency (€300k)", "Foreign capital for a small island economy"],
      MLT: ["capital", "Wealthy residents and investors", "Residency income; EU court struck down its citizenship-for-sale scheme in 2025"],
      TUR: ["capital", "Citizenship by investment ($400k property); Turkic kin; hosts millions of Syrians", "Foreign currency — while pressing refugees to return"],
      EGY: ["capital", "Citizenship by investment (from $250k); hosts Sudanese refugees", "Hard currency during a debt crisis"],
      // — nomads & retirees —
      PRT: ["lifestyle", "Remote workers and retirees on D7/D8 visas; Portuguese-speaking nations", "Reverse depopulation — but 2025 laws tightened entry and citizenship sharply"],
      THA: ["lifestyle", "Remote workers on the 5-year Destination Thailand Visa; retirees; wealthy long-stayers", "Tourism-led economy converting visitors into long-term spenders"],
      MYS: ["lifestyle", "Retirees and wealthy residents (MM2H); nomads (DE Rantau)", "Foreign spending and property demand; guest workers handled separately"],
      IDN: ["lifestyle", "Remote workers, second-home buyers and Golden Visa investors — mostly in Bali", "Capture spending from long-stay foreigners"],
      PHL: ["lifestyle", "Retirees on the SRRV from age 50", "Foreign pension income; the country itself exports workers"],
      MEX: ["lifestyle", "Remote workers and retirees qualifying by income", "Proximity to the US; residency by savings is simple"],
      CRI: ["lifestyle", "Retirees, rentiers and nomads", "Steady foreign income for a stable, small economy"],
      PAN: ["lifestyle", "Retirees (Pensionado), investors, Friendly Nations professionals", "Dollarised hub that sells residency as a product"],
      MUS: ["lifestyle", "Retirees, remote workers on the Premium Visa, investors", "Island economy moving from sugar to services"],
      // — guest workers —
      SAU: ["labour", "Sponsored foreign workers; Premium Residency for the wealthy", "Vision 2030 megaprojects — while reserving more jobs for Saudis"],
      QAT: ["labour", "Sponsored workers, about 85–90% of the population", "Gas wealth, tiny citizenry; almost no path to settle"],
      KWT: ["labour", "Sponsored workers — now being reduced", "Kuwaitisation: cutting the expatriate share of the population"],
      BHR: ["labour", "Sponsored workers; Golden Residency for high earners", "Small Gulf economy reliant on foreign labour"],
      OMN: ["labour", "Sponsored workers; long-term investor residency", "Omanisation limits which jobs foreigners may hold"],
      JPN: ["labour", "Specified Skilled Workers in shortage sectors; points for professionals", "Shrinking, ageing workforce — opening slowly after decades of near-closure"],
      KOR: ["labour", "Employment-permit workers for factories and farms; new talent visas", "World's lowest birth rate"],
      TWN: ["labour", "Southeast Asian factory and care workers; Gold Card for talent", "Ageing society and a chip industry short of people"],
      ITA: ["labour", "Quota workers under the flussi decrees (~165k a year)", "Farms, care and construction need hands; descent-based citizenship was curtailed in 2025"],
      POL: ["labour", "Ukrainian and Belarusian workers; kin via the Karta Polaka", "Fast-growing economy short of workers; 2025 strategy tightens control"],
      CZE: ["labour", "Ukrainian workers and refugees; skilled-worker programmes", "Lowest unemployment in the EU"],
      SVK: ["labour", "Ukrainian and Serbian industrial workers", "Car factories need labour as locals emigrate"],
      ROU: ["labour", "South Asian workers under a yearly quota", "Replace the millions of Romanians working abroad"],
      HRV: ["labour", "Nepali, Filipino and Indian seasonal workers; digital nomads", "Tourism and construction after mass emigration to the EU"],
      LTU: ["labour", "Belarusian, Ukrainian and Central Asian workers", "Logistics and construction shortages; security screening tightened"],
      RUS: ["labour", "Central Asian labour migrants; resettled compatriots", "Demographic decline; controls tightened sharply after 2024"],
      // — diaspora & kin —
      ISR: ["diaspora", "Jews and their descendants under the Law of Return", "Founding purpose of the state: immediate citizenship on arrival"],
      ARM: ["diaspora", "Ethnic Armenians worldwide; recent Russian relocators", "Diaspora larger than the country's own population"],
      HUN: ["diaspora", "Ethnic Hungarians (simplified citizenship); guest workers from Asia", "Kin-state policy and factory labour, alongside a hard line on asylum"],
      KAZ: ["diaspora", "Ethnic Kazakhs returning as Kandas; remote workers", "Rebuild the Kazakh share of the population"],
      IND: ["diaspora", "People of Indian origin via lifelong OCI status", "Tie the diaspora to home without allowing dual citizenship"],
      UKR: ["diaspora", "Ukrainians abroad and their descendants", "Multiple citizenship allowed from 2025 to bring people back after wartime emigration"],
      // — open door —
      ARG: ["open", "Almost anyone — Mercosur neighbours, rentiers, students", "Constitution invites immigrants; a 2025 decree added fees and a stricter citizenship test"],
      URY: ["open", "Anyone with a clean record and an income; tax holiday for newcomers", "Small, ageing population that wants residents"],
      PRY: ["open", "Anyone with a modest deposit or income", "Low-tax residency as a national offer"],
      BRA: ["open", "Mercosur residents, Venezuelans and Haitians on humanitarian visas, nomads", "Tradition of welcoming migration; regional free-residence agreement"],
      ESP: ["open", "Latin Americans, regularised undocumented workers, nomads", "Economy growing on migration; investor visa was scrapped in 2025 over housing"],
      COL: ["open", "Venezuelans on 10-year protection permits; remote workers", "Chose to regularise nearly 3 million neighbours instead of excluding them"],
      GEO: ["open", "Citizens of ~95 countries can stay a year visa-free", "Open-economy branding; work-permit rules introduced in 2026"],
      RWA: ["open", "All Africans visa-free; investors and professionals", "Positioning as a continental business hub"],
      KEN: ["open", "Visitors from nearly everywhere by e-authorisation; nomad permit", "Tourism and tech-hub ambitions"],
      // — family & humanitarian —
      USA: ["family", "Relatives of citizens (about two-thirds of green cards); H-1B professionals", "Family reunification is the system's core; 2025 brought mass enforcement and new fees"],
      UGA: ["family", "Refugees — about 1.7 million, with land and the right to work", "Open-door refugee policy unmatched in Africa"],
      JOR: ["family", "Syrian, Palestinian and Iraqi refugees", "Geography: one of the highest refugee shares per person anywhere"],
      // — largely closed —
      CHN: ["closed", "A handful of high-end specialists; young STEM graduates via the 2025 K visa", "No tradition of immigration; permanent residency is rare"],
      PRK: ["closed", "Essentially no one", "Borders are sealed in both directions"],
      BTN: ["closed", "Paying tourists only; citizenship takes 20 years", "Protect culture and identity — while its own young people emigrate"],
      TKM: ["closed", "Almost no one", "One of the hardest visas in the world to obtain"],
      ERI: ["closed", "Almost no one", "Closed state with indefinite national service"],
      CUB: ["closed", "Very few; a country people leave", "Record emigration since 2021"],
    },
  };

  const CIT_BUCKETS = [[3, "#30d158", "≤ 3 years"], [5, "#66d4cf", "4–5"], [8, "#ffd60a", "6–8"], [10, "#ff9f0a", "9–10"], [20, "#ff6b3a", "11–20"], [98, "#ff453a", "20+"], [999, "#636366", "No practical route"]];
  const citBucket = (y) => CIT_BUCKETS.find(([max]) => y <= max);
  const MODE_LABEL = { visa: "Visa", tax: "Tax", citizenship: "Citizenship", immigration: "Immigration" };

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
          ${this.modes.length > 1 ? `<div class="pm-modes">${this.modes.map((m) => `<button data-mode="${m}">${MODE_LABEL[m] || m}</button>`).join("")}</div>` : ""}
        </div>
        <div class="pm-map"></div>
        <div class="pm-panel">
          <div class="pm-status">Loading world…</div>
          <div class="pm-detail"></div>
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
        // touch has no hover, and on phones the popup would open under the
        // controls — so a tap pins the country's detail into the card
        this.el.querySelector(".pm-detail").innerHTML = `<b>${p.name}</b><br>${p.detail}`;
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
      this.el.querySelector(".pm-detail").innerHTML = "";
      this.el.querySelectorAll(".pm-modes button").forEach((b) =>
        b.classList.toggle("active", b.dataset.mode === this.mode)
      );
      if (this.mode === "tax") return this._renderTax();
      if (this.mode === "citizenship") return this._renderCitizenship();
      if (this.mode === "immigration") return this._renderImmigration();
      this._renderVisa();
    }

    _renderImmigration() {
      const counts = {};
      const features = [];
      for (const f of this.shapes.features) {
        const rec = IMMIGRATION.data[f.id];
        if (!rec) continue;
        const [approach, who, why] = rec;
        const [color, label] = IMM_APPROACH[approach];
        counts[approach] = (counts[approach] || 0) + 1;
        features.push({
          ...f,
          properties: {
            name: f.properties.name,
            iso3: f.id,
            req: `immigration:${approach}`,
            detail: `<b style="color:${color}">${label}</b><br><span style="opacity:.6">Attracts</span> ${who}<br><span style="opacity:.6">Why</span> ${why}`,
            color,
          },
        });
      }
      this.map.getSource("pm").setData({ type: "FeatureCollection", features });
      const own = IMMIGRATION.data[this.passport];
      this.el.querySelector(".pm-summary").innerHTML =
        `Who each country's immigration system is built to attract — tap a country for who and why` +
        (own ? `<br><span style="opacity:.75">${this.names[this.passport]} itself: ${IMM_APPROACH[own[0]][1]}</span>` : "");
      this.el.querySelector(".pm-legend").innerHTML =
        Object.entries(IMM_APPROACH).filter(([k]) => counts[k])
          .map(([k, [col, label]]) => `<span class="pm-key"><i style="background:${col}"></i>${label} · ${counts[k]}</span>`)
          .join("") +
        `<span class="pm-key" style="flex-basis:100%;opacity:.7">Curated ${IMMIGRATION.updated} · dominant approach only, most countries run several routes · verify locally</span>`;
    }

    _renderCitizenship() {
      const counts = {};
      const features = [];
      for (const f of this.shapes.features) {
        const rec = NATURALIZATION.data[f.id];
        if (!rec) continue;
        const [years, note, dual] = rec;
        const [, color, label] = citBucket(years);
        counts[label] = (counts[label] || 0) + 1;
        const dualText = dual === "yes" ? "dual citizenship allowed" : dual === "no" ? "must renounce other citizenship" : "dual citizenship restricted";
        features.push({
          ...f,
          properties: {
            name: f.properties.name,
            iso3: f.id,
            req: `citizenship:${years}`,
            detail: `${years >= 99 ? "No practical route" : `<b>${years} years</b> of residence`}<br>${note}<br><span style="opacity:.7">${dualText}</span>`,
            color,
          },
        });
      }
      this.map.getSource("pm").setData({ type: "FeatureCollection", features });
      const own = NATURALIZATION.data[this.passport];
      this.el.querySelector(".pm-summary").innerHTML =
        `Years of residence before you can apply for citizenship — standard route` +
        (own ? `<br><span style="opacity:.75">${this.names[this.passport]} itself: ${own[0] >= 99 ? "no practical route" : own[0] + " years"}</span>` : "");
      this.el.querySelector(".pm-legend").innerHTML =
        CIT_BUCKETS.filter(([, , label]) => counts[label])
          .map(([, col, label]) => `<span class="pm-key"><i style="background:${col}"></i>${label} · ${counts[label]}</span>`)
          .join("") +
        `<span class="pm-key" style="flex-basis:100%;opacity:.7">Curated ${NATURALIZATION.updated} · spouses, descent and investment routes are faster · verify locally</span>`;
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
