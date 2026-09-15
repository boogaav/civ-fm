// civfm-proxy — adds CORS + edge caching (and payload trimming) to open data
// feeds that don't send Access-Control-Allow-Origin themselves.
// Allowlist only: this is not a general-purpose proxy.

const ELECTIONS_SPARQL = `SELECT ?item ?itemLabel ?date ?cc ?countryLabel ?typeLabel WHERE {
  ?item wdt:P31 ?type . ?type wdt:P279* wd:Q40231 .
  ?item wdt:P585 ?date .
  OPTIONAL { ?item wdt:P17 ?country . OPTIONAL { ?country wdt:P297 ?cc } }
  FILTER(?date >= NOW() && ?date <= "2027-12-31T00:00:00Z"^^xsd:dateTime)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY ?date LIMIT 1000`;

const ROUTES = {
  "/gdacs": {
    url: "https://www.gdacs.org/xml/gdacs.geojson",
    ttl: 300,
  },
  // GDELT's API host has been down/CORS-blocked; routing it here means the
  // Signal channel lights up automatically whenever it comes back.
  "/gdelt": {
    url: "https://api.gdeltproject.org/api/v2/geo/geo?query=world&format=geojson&timespan=60min&maxpoints=300",
    ttl: 300,
  },
  // Anonymous OpenSky budget is ~400 credits/day and a global snapshot costs
  // 4 — a 15-minute edge cache keeps the whole site inside it. The client
  // dead-reckons positions between snapshots using velocity + heading.
  "/opensky": {
    url: "https://opensky-network.org/api/states/all",
    ttl: 900,
    transform: trimFlights,
  },
  "/launches": {
    url: "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=5",
    ttl: 900,
    transform: trimLaunches,
  },
  // Upcoming elections from Wikidata (SPARQL, ~12s upstream) — 24h edge cache
  "/elections": {
    url: "https://query.wikidata.org/sparql?query=" + encodeURIComponent(ELECTIONS_SPARQL),
    ttl: 86400,
    headers: { Accept: "application/json" },
    transform: trimElections,
  },
};

// Wikidata rows repeat an item once per date/country/type combination —
// dedupe by item, keep the earliest future date, classify the tier.
const NATIONAL = /general|presidential|parliamentary|legislative|federal|referendum|senate|congress|house of representatives|national assembly/;
const REGIONAL = /\bstate\b|provincial|gubernatorial|regional|\blocal\b|municipal|mayoral|council|county|city|territorial|cantonal|prefectural/;
const BYELECTION = /by-election|by election|special election/;

function tierOf(label, type) {
  const t = `${label} ${type}`.toLowerCase();
  if (BYELECTION.test(t)) return "by-election";
  if (REGIONAL.test(t)) return "regional";
  if (NATIONAL.test(t)) return "national";
  return "regional"; // unknown: never light a country up for it
}

function trimElections(data) {
  const byItem = new Map();
  for (const r of data.results?.bindings || []) {
    const qid = (r.item?.value || "").split("/").pop();
    const date = (r.date?.value || "").slice(0, 10);
    if (!qid || !date) continue;
    const prev = byItem.get(qid);
    if (prev && prev.date <= date) continue;
    const label = r.itemLabel?.value || qid;
    byItem.set(qid, {
      qid, label, date,
      cc: r.cc?.value || null,
      countryLabel: r.countryLabel?.value || null,
      tier: tierOf(label, r.typeLabel?.value || ""),
    });
  }
  const elections = [...byItem.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { fetched: new Date().toISOString(), elections };
}

// /trends?geo=CC — Google's daily search trends RSS (no CORS upstream).
// Google may refuse datacenter egress; the client degrades silently.
function trendsRoute(url) {
  const geo = url.searchParams.get("geo") || "";
  if (!/^[A-Z]{2}$/.test(geo)) return null;
  return {
    url: `https://trends.google.com/trending/rss?geo=${geo}`,
    ttl: 900,
    cachePath: `/trends/${geo}`,
    text: true,
    transform: (xml) => {
      const items = [];
      const re = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = re.exec(xml)) && items.length < 20) {
        const title = (m[1].match(/<title>(?:<!\[CDATA\[)?([^<\]]*)/) || [])[1];
        const traffic = (m[1].match(/<ht:approx_traffic>([^<]*)/) || [])[1];
        if (title) items.push({ title: title.trim(), traffic: (traffic || "").trim() });
      }
      return { geo, items };
    },
  };
}

// states[i]: [0]=icao24 [1]=callsign [5]=lon [6]=lat [8]=on_ground
// [9]=velocity m/s [10]=true_track — trim ~4MB to a compact ~60KB array
function trimFlights(data) {
  let states = (data.states || []).filter(
    (s) => s[5] != null && s[6] != null && !s[8] && s[9] > 30
  );
  if (states.length > 1500) {
    const step = states.length / 1500;
    states = Array.from({ length: 1500 }, (_, i) => states[Math.floor(i * step)]);
  }
  return {
    t: data.time,
    states: states.map((s) => [
      Math.round(s[5] * 1000) / 1000,
      Math.round(s[6] * 1000) / 1000,
      Math.round(s[9]),
      Math.round(s[10] || 0),
      (s[1] || "").trim(),
    ]),
  };
}

function trimLaunches(data) {
  return (data.results || [])
    .map((r) => ({
      name: r.name,
      net: r.net,
      status: r.status && r.status.abbrev,
      provider: r.launch_service_provider && r.launch_service_provider.name,
      pad: r.pad && r.pad.name,
      lat: r.pad ? Number(r.pad.latitude) : NaN,
      lon: r.pad ? Number(r.pad.longitude) : NaN,
    }))
    .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon));
}

const json = (obj, status = 200, ttl = 0) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...(ttl ? { "Cache-Control": `public, max-age=${ttl}` } : {}),
    },
  });

// /adsb?lat=..&lon=.. — regional aircraft via adsb.fi (no CORS upstream).
// Coordinates snap to a 1° grid so nearby viewers share one edge-cache entry.
function adsbRoute(url) {
  const lat = Math.round(Number(url.searchParams.get("lat") || 0));
  const lon = Math.round(Number(url.searchParams.get("lon") || 0));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180)
    return null;
  return {
    url: `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/250`,
    ttl: 60,
    cachePath: `/adsb/${lat}/${lon}`,
    transform: (d) => ({
      t: Math.floor((d.now || Date.now()) / 1000),
      states: (d.ac || [])
        .filter((a) => a.lat != null && a.lon != null && (a.gs || 0) > 30)
        .slice(0, 400)
        .map((a) => [
          Math.round(a.lon * 1000) / 1000,
          Math.round(a.lat * 1000) / 1000,
          Math.round((a.gs || 0) * 0.514), // knots → m/s
          Math.round(a.track || 0),
          (a.flight || "").trim(),
        ]),
    }),
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const route =
      url.pathname === "/adsb" ? adsbRoute(url)
      : url.pathname === "/trends" ? trendsRoute(url)
      : ROUTES[url.pathname];
    if (!route) return json({ error: "unknown route" }, 404);

    const cache = caches.default;
    const cacheKey = new Request(url.origin + (route.cachePath || url.pathname));
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    const upstream = await fetch(route.url, {
      headers: { "User-Agent": "civfm/0.1 (civ.fm; boogaav@gmail.com)", ...(route.headers || {}) },
    });
    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 240);
      return json({ error: `upstream ${upstream.status}`, detail }, 502);
    }

    let res;
    if (route.transform) {
      const body = route.transform(route.text ? await upstream.text() : await upstream.json());
      res = json(body, 200, route.ttl);
    } else {
      res = new Response(upstream.body, {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": `public, max-age=${route.ttl}`,
        },
      });
    }
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};
