// civfm-api — CIV FM's data as a public JSON API and an MCP server, so people
// and AI assistants can ask the same globe questions without the globe.
// Every answer names its sources and links back to the right view on civ.fm.
// Data is read live from civ.fm (static files) and, for World Bank series,
// from the civfm-proxy Worker's 12-hour cache through a service binding.

const SITE = "https://civ.fm";
const VERSION = "1.0.0";

// friendly indicator names → World Bank codes (any raw WB code also works)
const INDICATORS = {
  population: ["SP.POP.TOTL", "Population", "people"],
  gdp: ["NY.GDP.MKTP.CD", "GDP", "current US$"],
  gdp_per_capita_ppp: ["NY.GDP.PCAP.PP.CD", "GDP per person, PPP", "current international $"],
  life_expectancy: ["SP.DYN.LE00.IN", "Life expectancy at birth", "years"],
  fertility: ["SP.DYN.TFRT.IN", "Births per woman", "births"],
  inflation: ["FP.CPI.TOTL.ZG", "Inflation, consumer prices", "% per year"],
  unemployment: ["SL.UEM.TOTL.ZS", "Unemployment", "% of labour force"],
  government_debt: ["GC.DOD.TOTL.GD.ZS", "Central government debt", "% of GDP"],
  tax_revenue: ["GC.TAX.TOTL.GD.ZS", "Tax revenue", "% of GDP"],
  government_spending: ["GC.XPN.TOTL.GD.ZS", "Government expense", "% of GDP"],
  health_spending: ["SH.XPD.CHEX.GD.ZS", "Health spending", "% of GDP"],
  education_spending: ["SE.XPD.TOTL.GD.ZS", "Public education spending", "% of GDP"],
  military_spending: ["MS.MIL.XPND.GD.ZS", "Military spending", "% of GDP"],
  physicians: ["SH.MED.PHYS.ZS", "Physicians", "per 1,000 people"],
  internet_users: ["IT.NET.USER.ZS", "Internet users", "% of population"],
  urban_population: ["SP.URB.TOTL.IN.ZS", "Urban population", "% of population"],
  water_stress: ["ER.H2O.FWST.ZS", "Water stress", "% of renewable freshwater withdrawn"],
  inequality_gini: ["SI.POV.GINI", "Gini index", "0 = equal, 100 = unequal"],
  homicide_rate: ["VC.IHR.PSRC.P5", "Intentional homicides", "per 100,000 people"],
};
const PROFILE_INDICATORS = ["population", "gdp_per_capita_ppp", "life_expectancy", "inflation", "unemployment", "tax_revenue", "government_debt", "health_spending", "internet_users"];

/* ---------------- data access ---------------- */

const mem = new Map(); // per-isolate cache on top of the edge cache
async function site(path, ttl = 3600) {
  const hit = mem.get(path);
  if (hit && Date.now() - hit.t < ttl * 1000) return hit.v;
  const r = await fetch(SITE + path, { cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  const v = path.endsWith(".json") ? await r.json() : await r.text();
  mem.set(path, { t: Date.now(), v });
  return v;
}
async function wb(env, code) {
  const key = "wb:" + code, hit = mem.get(key);
  if (hit && Date.now() - hit.t < 3600e3) return hit.v;
  const r = await env.PROXY.fetch(`https://civfm-proxy/wb/${code}`);
  if (!r.ok) throw new Error(`World Bank ${code}: ${r.status}`);
  const v = await r.json();
  mem.set(key, { t: Date.now(), v });
  return v;
}

let COUNTRIES = null;
async function countries() {
  if (COUNTRIES) return COUNTRIES;
  const rows = await site("/vendor/world-countries.json", 86400);
  const by3 = {}, keys = [];
  for (const c of rows) {
    by3[c.cca3] = c;
    for (const n of [c.cca3, c.cca2, c.name.common, c.name.official, ...Object.values(c.name.nativeName || {}).map((x) => x.common)])
      if (n) keys.push([norm(n), c.cca3]);
  }
  for (const [n, iso] of Object.entries(ALIAS)) keys.push([n, iso]);
  return (COUNTRIES = { rows, by3, keys });
}
const ALIAS = { usa: "USA", us: "USA", america: "USA", uk: "GBR", britain: "GBR", england: "GBR", russia: "RUS", "south korea": "KOR", korea: "KOR", "north korea": "PRK", uae: "ARE", holland: "NLD", "czech republic": "CZE", turkey: "TUR", "ivory coast": "CIV", burma: "MMR", vatican: "VAT", drc: "COD", congo: "COG", palestine: "PSE", taiwan: "TWN", iran: "IRN", syria: "SYR", vietnam: "VNM", laos: "LAO", moldova: "MDA", bolivia: "BOL", venezuela: "VEN", tanzania: "TZA" };
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-zЀ-ӿ ]/g, " ").replace(/\s+/g, " ").trim();

async function resolve(q) {
  const { by3, keys } = await countries();
  const raw = String(q || "").trim();
  if (by3[raw.toUpperCase()]) return by3[raw.toUpperCase()];
  const n = norm(raw);
  if (!n) return null;
  const exact = keys.find(([k]) => k === n);
  if (exact) return by3[exact[1]];
  const pre = keys.find(([k]) => k.startsWith(n) && n.length >= 3);
  return pre ? by3[pre[1]] : null;
}

const fail = (status, error, extra) => Object.assign(new Error(error), { status, extra });
async function need(q) {
  const c = await resolve(q);
  if (!c) throw fail(404, `No country matches "${q}". Use a name, or an ISO 3166 alpha-2/alpha-3 code.`);
  return c;
}
const pick = (c) => ({ iso3: c.cca3, iso2: c.cca2, name: c.name.common, official_name: c.name.official, flag: c.flag, region: c.region, subregion: c.subregion, capital: (c.capital || [])[0] || null });
const globe = (ch, sub, iso) => `${SITE}/?ch=${ch}${sub ? `&sub=${sub}` : ""}&c=${iso}`;

/* ---------------- answers ---------------- */

async function indicatorValues(env, keys, iso) {
  const out = {};
  await Promise.all(keys.map(async (k) => {
    const [code, label, unit] = INDICATORS[k];
    try {
      const rec = (await wb(env, code))[iso];
      out[k] = rec ? { value: rec.value, year: Number(rec.year), label, unit, wb_code: code } : null;
    } catch (e) { out[k] = null; }
  }));
  return out;
}

async function profile(env, q) {
  const c = await need(q), iso = c.cca3;
  const [civic, parties, atlas, taxes, power, trade, migration, ind] = await Promise.all([
    site("/civic/civic.json").catch(() => ({ c: {} })),
    site("/civic/parties.json").catch(() => ({ c: {} })),
    site("/civic/atlas/atlas.json", 86400).catch(() => null),
    site("/api/taxes.json").catch(() => null),
    site(`/civic/power/${iso}.json`).catch(() => null),
    site("/links/trade.json").catch(() => null),
    site("/links/migration.json").catch(() => null),
    indicatorValues(env, PROFILE_INDICATORS, iso),
  ]);
  const v = civic.c[iso] || {}, p = parties.c[iso];
  const cons = atlas && atlas.cons.find((x) => x.iso === iso);
  const fam = cons && atlas.families.find((f) => f.k === cons.fam);
  const tr = trade && trade.c[iso], mi = migration && migration.c[iso];
  const top3 = (rows) => (rows || []).slice(0, 3).map(([k, val]) => ({ iso3: k, value: val }));
  return {
    country: pick(c),
    state: {
      system: v.gov || null,
      head_of_state: v.chief || null,
      head_of_government: v.head || null,
      legislature: v.legis ? { name: v.legis.name, structure: v.legis.structure, seats: v.legis.seats, term: v.legis.term } : null,
      legal_system: v.legal || null,
      suffrage: v.suffrage || null,
      religions: v.religions || null,
      constitution: cons ? { title: cons.title, year: cons.year, words: cons.words, articles: cons.arts, family: fam ? fam.name : null, read: `${SITE}/civic/constitution/?c=${iso}` } : null,
      parliament: p ? { house: p.house, seats: p.total, as_of: p.date, parties: p.parties.slice(0, 8).map((x) => ({ name: x.name, seats: x.seats, share_pct: x.pct, leads_government: !!x.leads })) } : null,
      most_powerful: power ? power.people.slice(0, 5).map((x) => ({ name: x.n, role: x.r, wikipedia: x.w ? `https://en.wikipedia.org/wiki/${x.w}` : null })) : null,
    },
    taxes: taxes ? { top_personal_income_rate_pct: taxes.income[c.cca2]?.[0] ?? null, income_note: taxes.income[c.cca2]?.[1] ?? null, corporate_rate_pct: taxes.corporate[c.cca2]?.[0] ?? null, corporate_note: taxes.corporate[c.cca2]?.[1] ?? null, as_of: taxes.updated } : null,
    indicators: ind,
    links: {
      trade: tr ? { year: tr.y, exports_usd: tr.xT ?? null, imports_usd: tr.mT ?? null, top_export_partners: top3(tr.x), top_import_partners: top3(tr.m) } : null,
      migration: mi ? { year: migration.year, emigrants_abroad: mi.outT, immigrants_resident: mi.inT, emigrants_live_in: top3(mi.out), immigrants_born_in: top3(mi.in) } : null,
    },
    on_the_globe: {
      state: globe("state", "system", iso), parties: globe("state", "parties", iso), tax: globe("state", "tax", iso),
      money: globe("money", "gdp", iso), home: globe("home", null, iso), civic: `${SITE}/civic/#${iso}`,
    },
    sources: [
      "CIA World Factbook (government, legislature, religions; public domain)",
      "Constitute Project (constitution texts and topics; CC BY-NC 3.0)",
      "Wikidata and Wikipedia (parties, people; CC0 / CC BY-SA)",
      "World Bank Open Data (indicators; CC BY 4.0)",
      "UN Comtrade (goods trade) and UN DESA International Migrant Stock 2024",
      "CIV FM curated tax snapshot (planning summary, not tax advice)",
    ],
  };
}

async function rank(env, { indicator, order = "desc", limit = 10, region }) {
  const def = INDICATORS[indicator];
  const code = def ? def[0] : String(indicator || "").toUpperCase();
  if (!/^[A-Z0-9.]{3,40}$/.test(code)) throw fail(400, `Unknown indicator. Use one of: ${Object.keys(INDICATORS).join(", ")}, or a World Bank code like SP.DYN.LE00.IN.`);
  const [data, { by3 }] = await Promise.all([wb(env, code), countries()]);
  const reg = region ? norm(region) : null;
  const rows = Object.entries(data)
    .filter(([iso]) => by3[iso] && (!reg || norm(by3[iso].region) === reg || norm(by3[iso].subregion) === reg))
    .map(([iso, r]) => ({ ...pick(by3[iso]), value: r.value, year: Number(r.year) }))
    .sort((a, b) => (order === "asc" ? a.value - b.value : b.value - a.value));
  const n = Math.max(1, Math.min(250, Number(limit) || 10));
  return { indicator: def ? { key: indicator, label: def[1], unit: def[2], wb_code: code } : { wb_code: code }, order, region: region || null, countries_with_data: rows.length, results: rows.slice(0, n), source: `World Bank Open Data, ${code}, latest year each country reported` };
}

async function links(q, type = "trade") {
  const c = await need(q), iso = c.cca3;
  const { by3 } = await countries();
  const name = (rows) => (rows || []).map(([k, v]) => ({ iso3: k, name: by3[k]?.name.common || k, value: v }));
  if (type === "migration") {
    const m = await site("/links/migration.json");
    const r = m.c[iso];
    if (!r) throw fail(404, `No migration data for ${c.name.common}.`);
    return { country: pick(c), type, year: m.year, unit: "people (stock: born in one country, living in the other)", emigrants_abroad: r.outT, immigrants_resident: r.inT, emigrants_live_in: name(r.out), immigrants_born_in: name(r.in), on_the_globe: globe("home", null, iso), source: "UN DESA International Migrant Stock 2024" };
  }
  if (type !== "trade") throw fail(400, 'type must be "trade" or "migration"');
  const t = await site("/links/trade.json").catch(() => { throw fail(503, "Trade links are still being collected; try type=migration."); });
  const r = t.c[iso];
  if (!r) throw fail(404, `No trade data for ${c.name.common}.`);
  return { country: pick(c), type, year: r.y, unit: "US$, goods only", exports_usd: r.xT ?? null, imports_usd: r.mT ?? null, sells_to: name(r.x), buys_from: name(r.m), on_the_globe: globe("money", "gdp", iso), source: "UN Comtrade, as reported by the country" };
}

// constitution full-text search: paragraphs that contain every word of the query
async function constitutionSearch(q, query, limit = 8) {
  const c = await need(q), iso = c.cca3;
  const words = norm(query).split(" ").filter((w) => w.length > 1);
  if (!words.length) throw fail(400, "Give a search phrase, e.g. 'freedom of speech'.");
  let html;
  try { html = await site(`/civic/constitutions/${iso}.html`, 86400); } catch (e) { throw fail(404, `No constitution text on file for ${c.name.common}.`); }
  const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]?.replace(/\s+/g, " ").trim();
  const hits = [];
  let heading = "";
  for (const m of html.matchAll(/<(h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/g)) {
    const text = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
    if (m[1] !== "p" && m[1] !== "li") { heading = text; continue; }
    const t = norm(text);
    if (words.every((w) => t.includes(w))) hits.push({ article: heading || null, text: text.length > 700 ? text.slice(0, 700) + "…" : text });
    if (hits.length >= limit) break;
  }
  return { country: pick(c), constitution: title || null, query, matches: hits, read: `${SITE}/civic/constitution/?c=${iso}`, source: "Constitute Project, English translation, CC BY-NC 3.0" };
}

// which constitutions cover a topic (Constitute's 329-topic coding)
async function constitutionTopic(topic) {
  const atlas = await site("/civic/atlas/atlas.json", 86400);
  const n = norm(topic);
  const scored = atlas.topics.map((t, i) => ({ i, t, s: norm(t.label) === n ? 3 : norm(t.label).includes(n) ? 2 : n.split(" ").every((w) => norm(t.label).includes(w)) ? 1 : 0 })).filter((x) => x.s).sort((a, b) => b.s - a.s || b.t.n - a.t.n);
  if (!scored.length) throw fail(404, `No constitutional topic matches "${topic}".`, { hint: "Try words like 'right to health', 'death penalty', 'official language', 'term limits'." });
  const { i, t } = scored[0];
  const { by3 } = await countries();
  const has = atlas.cons.filter((c) => c.t.includes(i)).map((c) => c.iso);
  return {
    topic: t.label, group: t.sub, constitutions_with_topic: has.length, of: atlas.cons.length,
    countries: has.map((iso) => ({ iso3: iso, name: by3[iso]?.name.common || iso })),
    other_matching_topics: scored.slice(1, 6).map((x) => x.t.label),
    compare: `${SITE}/civic/compare/?t=${t.k}`,
    source: "Constitute Project topic coding of constitutions in force",
  };
}

async function compare(env, list) {
  const qs = (Array.isArray(list) ? list : String(list || "").split(",")).map((s) => String(s).trim()).filter(Boolean).slice(0, 6);
  if (qs.length < 2) throw fail(400, "Give two to six countries.");
  const ps = await Promise.all(qs.map((q) => profile(env, q)));
  return { countries: ps.map((p) => ({ ...p.country, system: p.state.system, head_of_government: p.state.head_of_government, constitution_year: p.state.constitution?.year ?? null, top_income_tax_pct: p.taxes?.top_personal_income_rate_pct ?? null, corporate_tax_pct: p.taxes?.corporate_rate_pct ?? null, ...Object.fromEntries(Object.entries(p.indicators).map(([k, v]) => [k, v ? v.value : null])) })), indicator_years_vary: true, sources: ps[0].sources };
}

/* ---------------- MCP (Streamable HTTP, stateless JSON responses) ---------------- */

const TOOLS = [
  { name: "get_country_profile", description: "Everything CIV FM knows about one country: government and constitution, parliament parties, most powerful people, tax rates, key World Bank indicators, top trade and migration partners, with sources and links to the globe.",
    inputSchema: { type: "object", properties: { country: { type: "string", description: "Country name or ISO code, e.g. 'Ukraine', 'DE', 'BRA'" } }, required: ["country"] },
    run: (env, a) => profile(env, a.country) },
  { name: "rank_countries", description: `Rank countries by an indicator (latest year each reported). Indicators: ${Object.keys(INDICATORS).join(", ")}; or any World Bank code.`,
    inputSchema: { type: "object", properties: { indicator: { type: "string" }, order: { type: "string", enum: ["desc", "asc"], default: "desc" }, limit: { type: "integer", default: 10, maximum: 250 }, region: { type: "string", description: "Optional region or subregion, e.g. 'Europe', 'Western Africa'" } }, required: ["indicator"] },
    run: (env, a) => rank(env, a) },
  { name: "compare_countries", description: "Side-by-side table of 2 to 6 countries: system, head of government, constitution year, tax rates and key indicators.",
    inputSchema: { type: "object", properties: { countries: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 } }, required: ["countries"] },
    run: (env, a) => compare(env, a.countries) },
  { name: "get_links", description: "A country's strongest links: trade (top export and import partners, US$) or migration (where its emigrants live, where its immigrants were born).",
    inputSchema: { type: "object", properties: { country: { type: "string" }, type: { type: "string", enum: ["trade", "migration"], default: "trade" } }, required: ["country"] },
    run: (env, a) => links(a.country, a.type || "trade") },
  { name: "search_constitution", description: "Search a country's constitution (English text) for passages containing all words of a phrase. Returns the matching clauses with their article headings.",
    inputSchema: { type: "object", properties: { country: { type: "string" }, query: { type: "string" }, limit: { type: "integer", default: 8, maximum: 30 } }, required: ["country", "query"] },
    run: (env, a) => constitutionSearch(a.country, a.query, Math.min(30, a.limit || 8)) },
  { name: "constitutions_with_topic", description: "Which national constitutions in force cover a topic (Constitute Project's coding), e.g. 'right to health care', 'death penalty', 'term limits', 'official language'.",
    inputSchema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] },
    run: (env, a) => constitutionTopic(a.topic) },
];

async function mcp(req, env) {
  let msg;
  try { msg = await req.json(); } catch (e) { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  if (Array.isArray(msg)) return json(await Promise.all(msg.map((m) => rpc(m, env))).then((r) => r.filter(Boolean)));
  const out = await rpc(msg, env);
  return out ? json(out) : new Response(null, { status: 202, headers: CORS });
}
async function rpc(m, env) {
  if (!m || m.id === undefined) return null; // notifications need no answer
  const ok = (result) => ({ jsonrpc: "2.0", id: m.id, result });
  switch (m.method) {
    case "initialize":
      return ok({ protocolVersion: m.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} },
        serverInfo: { name: "civ-fm", title: "CIV FM — how the human world works", version: VERSION },
        instructions: "Sourced facts about every country: government, constitutions, parties, power, taxes, World Bank indicators, trade and migration links. Cite the sources and the civ.fm links each tool returns." });
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOLS.map(({ run, ...t }) => t) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === m.params?.name);
      if (!tool) return { jsonrpc: "2.0", id: m.id, error: { code: -32602, message: `Unknown tool ${m.params?.name}` } };
      try {
        const data = await tool.run(env, m.params.arguments || {});
        return ok({ content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data });
      } catch (e) {
        return ok({ content: [{ type: "text", text: e.message }], isError: true });
      }
    }
    default: return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } };
  }
}

/* ---------------- HTTP ---------------- */

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version" };
const json = (data, status = 200, maxAge = 0) => new Response(JSON.stringify(data, null, 1), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store" } });

const INDEX = {
  name: "CIV FM API", version: VERSION, about: "Sourced facts about every country, from the same data as the civ.fm globe. Free, no key. Please link to civ.fm when you use it.",
  mcp: "POST /mcp (Model Context Protocol, Streamable HTTP). Tools: " + TOOLS.map((t) => t.name).join(", "),
  endpoints: {
    "GET /v1/countries": "every country with ISO codes and region",
    "GET /v1/country/{name or ISO}": "full profile",
    "GET /v1/compare?c=DEU,FRA,POL": "side by side, 2 to 6 countries",
    "GET /v1/rank?indicator=life_expectancy&order=desc&limit=10&region=Europe": "ranked list; /v1/indicators lists names",
    "GET /v1/links/{country}?type=trade|migration": "strongest partners",
    "GET /v1/constitution/{country}?q=freedom of speech": "search the constitution's text",
    "GET /v1/topic?q=right to health": "which constitutions cover a topic",
  },
  guide: SITE + "/guide/", llms: SITE + "/llms.txt",
};

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url), p = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/", q = url.searchParams;
    try {
      if (p === "/mcp") return req.method === "POST" ? mcp(req, env) : json({ error: "MCP endpoint: POST JSON-RPC here." }, 405);
      if (req.method !== "GET") return json({ error: "GET only" }, 405);
      if (p === "/") return json(INDEX, 200, 3600);
      if (p === "/v1/indicators") return json(Object.fromEntries(Object.entries(INDICATORS).map(([k, [code, label, unit]]) => [k, { label, unit, wb_code: code }])), 200, 86400);
      if (p === "/v1/countries") return json((await countries()).rows.map(pick).sort((a, b) => a.name.localeCompare(b.name)), 200, 86400);
      let m;
      if ((m = p.match(/^\/v1\/country\/(.+)$/))) return json(await profile(env, m[1]), 200, 3600);
      if (p === "/v1/compare") return json(await compare(env, q.get("c")), 200, 3600);
      if (p === "/v1/rank") return json(await rank(env, { indicator: q.get("indicator"), order: q.get("order") || "desc", limit: q.get("limit"), region: q.get("region") }), 200, 3600);
      if ((m = p.match(/^\/v1\/links\/(.+)$/))) return json(await links(m[1], q.get("type") || "trade"), 200, 3600);
      if ((m = p.match(/^\/v1\/constitution\/(.+)$/))) return json(await constitutionSearch(m[1], q.get("q") || "", Math.min(30, Number(q.get("limit")) || 8)), 200, 3600);
      if (p === "/v1/topic") return json(await constitutionTopic(q.get("q") || ""), 200, 3600);
      return json({ error: "Not found", see: "/" }, 404);
    } catch (e) {
      return json({ error: e.message, ...(e.extra || {}) }, e.status || 502);
    }
  },
};
