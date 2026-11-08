// Builds the plain-HTML field guide (guide/index.html), llms.txt, sitemap.xml
// and robots.txt from explain.js, so the map readers and AI crawlers see always
// matches the dial. Run after changing channels or explanations:
//   node build_guide.mjs
import fs from "node:fs";

const src = fs.readFileSync("explain.js", "utf8");
const EXPLAIN = new Function(src.slice(0, src.indexOf("\n};", src.indexOf("const EXPLAIN")) + 3) + ";return EXPLAIN")();
const SITE = "https://civ.fm";

// The seven layers in the order an outsider would learn them: each one rests on
// the one before. `why` is that dependency, said once.
const LAYERS = [
  ["earth", "Earth", "88.0", "The planet", "Everything else stands on this: air to breathe, ground that holds, water to drink.",
    "Can I breathe, is the ground safe, can I drink?", { air: "Air", ground: "Ground", water: "Water", risk: "Risk" },
    [["relief/", "Relief", "The shape of the land and where rivers flood."], ["plan/", "Survival plan", "Your country's threats, ranked, and what to do before, during and after each."]]],
  ["body", "Body", "91.0", "The species", "On that planet live eight billion bodies. How long they last, who heals them, what they put into themselves.",
    "Will this place keep me healthy, and what may I legally consume?",
    { life: "Life", care: "Care", cannabis: "Cannabis", alcohol: "Alcohol", tobacco: "Tobacco", psychedelics: "Psychedelics" }, []],
  ["home", "Home", "93.0", "The settlement", "Bodies cluster into places. A country average hides the region a person actually lives in.",
    "What is it like where you actually live, not the country average?",
    { living: "Living", health: "Health", school: "School", income: "Income", internet: "Internet", lights: "Lights" }, []],
  ["money", "Money", "98.0", "The exchange", "Settled people trade. Money is how they keep score of work, debt and value.",
    "What does a life cost here, and what is my money worth?",
    { gdp: "GDP", inflation: "Inflation", gold: "Gold", debt: "Debt", markets: "Markets", income: "Income tax", corporate: "Corporate tax" }, []],
  ["state", "State", "100.5", "The rules", "Trade needs rules, so people agree on states: who governs, who votes, who may cross a border, who pays.",
    "Who governs here, by what rules, and when do people vote?",
    { system: "System", vote: "Vote", parties: "Parties", power: "Power", tax: "Tax", passport: "Passport", citizenship: "Citizenship", immigration: "Immigration" },
    [["civic/", "Civic", "Every national constitution: read, compare, find a country's constitutional brother."],
     ["civic/atlas/", "Constitution Atlas", "What the world's constitutions agree on and where they split."],
     ["card/", "Country card", "Any country in one shareable image."],
     ["passport/", "Two passports", "Pick yours and your partner's: where you can both travel without a visa."],
     ["gov/", "Ukraine: government and budget", "Every minister, their ministry's money and programmes; where the state's money comes from and goes; city and regional budgets."]]],
  ["mind", "Mind", "103.0", "The meaning", "Above the rules sit beliefs: what people worship, read, listen to and talk about.",
    "What do people here believe, read and listen to, right now?", { faith: "Faith", reading: "Reading", radio: "Radio", signal: "Signal" }, []],
  ["future", "Future", "106.5", "The trajectory", "All of it is moving. The last layer asks where a place is heading this century.",
    "What will this place become in the worst-case century?", { outlook: "Outlook", zone: "Climate zone", crops: "Crops", warming: "Warming" }, []],
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
for (const [ch, , , , , , subs] of LAYERS)
  for (const k of [ch, ...Object.keys(subs).map((s) => `${ch}/${s}`)])
    if (!EXPLAIN[k]) throw new Error(`explain.js has no entry for ${k}`); // keep the guide in step with the dial

/* ---------- guide/index.html ---------- */
const layerHtml = LAYERS.map(([ch, name, num, kind, why, q, subs, rooms], i) => `
<section id="${ch}">
  <p class="kicker">Layer ${i + 1} · ${num} FM · ${kind}</p>
  <h2>${name}</h2>
  <p class="why">${esc(why)}</p>
  <p class="q">“${esc(q)}”</p>
  <dl>${Object.entries(subs).map(([id, label]) => `
    <dt><a href="../?ch=${ch}&amp;sub=${id}">${label}</a></dt>
    <dd>${esc(EXPLAIN[`${ch}/${id}`].what)}<span class="src">Source: ${esc(EXPLAIN[`${ch}/${id}`].src)}</span></dd>`).join("")}
  </dl>${rooms.length ? `
  <p class="rooms">${rooms.map(([href, label, d]) => `<a href="../${href}"><b>${label} ↗</b> ${esc(d)}</a>`).join("")}</p>` : ""}
</section>`).join("");

const title = "How the human world works — CIV FM field guide";
const desc = "A field guide to the human world in seven layers: the planet, the species, the settlement, the exchange, the rules, the meaning and the trajectory. Every number on CIV FM is sourced.";
const ld = {
  "@context": "https://schema.org", "@type": "WebPage", name: title, description: desc, url: `${SITE}/guide/`,
  isPartOf: { "@type": "WebSite", name: "CIV FM", url: SITE },
  hasPart: LAYERS.map(([ch, name, , kind, why]) => ({ "@type": "WebPageElement", name: `${name}: ${kind}`, description: why, url: `${SITE}/guide/#${ch}` })),
};

fs.mkdirSync("guide", { recursive: true });
fs.writeFileSync("guide/index.html", `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/guide/">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/guide/">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='34' fill='none' stroke='%230d0d0d' stroke-width='8'/><circle cx='50' cy='50' r='8' fill='%230d0d0d'/></svg>">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
:root { --bg:#fff; --surface:#f7f7f8; --ink:#0d0d0d; --body:#353740; --muted:#6e6e80; --rule:#ececf1;
  --sans:"Inter",-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",sans-serif; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--sans); font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased; }
a { color:inherit; text-decoration:none; }
.bar { display:flex; justify-content:space-between; align-items:center; max-width:880px; margin:0 auto; padding:20px 16px; }
.bar b { font-weight:600; } .bar nav { display:flex; gap:22px; font-size:14px; color:var(--muted); } .bar nav a:hover { color:var(--ink); }
main { max-width:880px; margin:0 auto; padding:24px 16px 80px; }
h1 { font-size:clamp(34px,6vw,52px); line-height:1.08; letter-spacing:-.03em; font-weight:600; margin:24px 0 16px; }
.lede { font-size:19px; color:var(--body); max-width:640px; margin:0 0 28px; }
ol.stack { list-style:none; padding:0; margin:0 0 56px; border-top:1px solid var(--rule); }
ol.stack li { border-bottom:1px solid var(--rule); } ol.stack a { display:grid; grid-template-columns:36px 110px 1fr; gap:12px; padding:12px 0; color:var(--body); }
ol.stack a:hover { background:var(--surface); } ol.stack span { color:var(--muted); } ol.stack b { color:var(--ink); font-weight:600; }
section { padding:40px 0; border-top:1px solid var(--rule); }
.kicker { font-size:13px; color:var(--muted); margin:0; letter-spacing:.02em; }
h2 { font-size:30px; letter-spacing:-.02em; font-weight:600; margin:4px 0 8px; }
.why { font-size:18px; color:var(--body); margin:0 0 6px; max-width:680px; } .q { color:var(--muted); font-style:italic; margin:0 0 20px; }
dl { margin:0; display:grid; grid-template-columns:150px 1fr; gap:14px 20px; }
dt a { font-weight:600; border-bottom:1px solid var(--rule); } dt a:hover { border-color:var(--ink); }
dd { margin:0; color:var(--body); } .src { display:block; font-size:13px; color:var(--muted); margin-top:2px; }
.rooms { display:grid; gap:8px; margin:22px 0 0; } .rooms a { display:block; padding:12px 14px; background:var(--surface); border-radius:10px; color:var(--body); }
.rooms a:hover { background:var(--rule); } .rooms b { color:var(--ink); font-weight:600; margin-right:6px; }
footer { max-width:880px; margin:0 auto; padding:24px 16px 48px; color:var(--muted); font-size:14px; border-top:1px solid var(--rule); }
@media (max-width:600px) { dl { grid-template-columns:1fr; gap:2px; } dd { margin-bottom:12px; } ol.stack a { grid-template-columns:28px 80px 1fr; } }
</style>
</head>
<body>
<header class="bar"><a href="../"><b>CIV FM</b></a><nav><a href="../">Globe</a><a href="../civic/">Civic</a><a href="../about/">About</a></nav></header>
<main>
<h1>How the human world works.</h1>
<p class="lede">If you arrived from outside, an alien or a new mind, this is the order to learn us in. Seven layers, each resting on the one below. Every layer is a station on the CIV FM dial, and every number has a source.</p>
<ol class="stack">${LAYERS.map(([ch, name, , kind, , q], i) => `
  <li><a href="#${ch}"><span>${i + 1}</span><b>${name}</b>${kind}. ${esc(q)}</a></li>`).join("")}
</ol>
${layerHtml}
</main>
<footer>Built from the same explanations the globe shows on hover. Open data, sources named at every line. <a href="../llms.txt">llms.txt</a> · <a href="https://civfm-api.boogaav.workers.dev/">Free JSON API</a> · MCP server for AI assistants: <code>https://civfm-api.boogaav.workers.dev/mcp</code></footer>
<script src="https://booga-sdk.boogaav.workers.dev/v1.js" data-app="civfm" defer></script>
<script src="../track.js" defer></script>
</body>
</html>
`);

/* ---------- llms.txt ---------- */
fs.writeFileSync("llms.txt", `# CIV FM

> CIV FM (civ.fm) is a free, open-data globe that explains how the human world works, country by country, in seven layers: Earth (the planet), Body (the species), Home (the settlement), Money (the exchange), State (the rules), Mind (the meaning) and Future (the trajectory). Every figure names its source: World Bank, WHO, Open-Meteo, USGS, NASA, Global Data Lab, Constitute Project, Wikidata, CIA World Factbook and others.

Deep links open any layer for any country: ${SITE}/?ch=<layer>&sub=<section>&c=<ISO3>, for example ${SITE}/?ch=state&sub=tax&c=DEU.

## Guide

- [How the human world works](${SITE}/guide/): the seven layers, every section, what it measures and where the data comes from

## Layers
${LAYERS.map(([ch, name, , kind, why, q, subs]) => `
### ${name}: ${kind}

${why} Question it answers: "${q}"

${Object.entries(subs).map(([id, label]) => `- [${label}](${SITE}/?ch=${ch}&sub=${id}): ${EXPLAIN[`${ch}/${id}`].what} Source: ${EXPLAIN[`${ch}/${id}`].src}`).join("\n")}`).join("\n")}

## Tools

${LAYERS.flatMap(([, , , , , , , rooms]) => rooms).map(([href, label, d]) => `- [${label}](${SITE}/${href}): ${d}`).join("\n")}
- [About](${SITE}/about/): who builds CIV FM

## API and MCP

Free, no key. Every answer names its sources and links back to the globe.

- [API index](https://civfm-api.boogaav.workers.dev/): endpoints and examples
- [Country profile](https://civfm-api.boogaav.workers.dev/v1/country/Ukraine): government, constitution, parties, power, taxes, indicators, trade and migration links
- [Rank countries](https://civfm-api.boogaav.workers.dev/v1/rank?indicator=life_expectancy&region=Europe): by any of 19 named indicators or a World Bank code
- [Compare](https://civfm-api.boogaav.workers.dev/v1/compare?c=DEU,FRA,POL): two to six countries side by side
- [Constitution search](https://civfm-api.boogaav.workers.dev/v1/constitution/USA?q=freedom%20of%20speech): matching clauses with article headings
- [Constitutional topic](https://civfm-api.boogaav.workers.dev/v1/topic?q=right%20to%20health%20care): which constitutions cover it
- MCP (Model Context Protocol, Streamable HTTP): https://civfm-api.boogaav.workers.dev/mcp with tools get_country_profile, rank_countries, compare_countries, get_links, search_constitution, constitutions_with_topic

## Optional

- [Constitution comparison](${SITE}/civic/compare/): what the world's constitutions share, topic by topic
- [Constitution reader](${SITE}/civic/constitution/?c=USA): any national constitution, full text, by ISO3 code
`);

/* ---------- sitemap.xml + robots.txt ---------- */
const pages = ["", "guide/", "civic/", "civic/atlas/", "civic/compare/", "civic/constitution/", "card/", "passport/", "relief/", "plan/", "gov/", "about/"];
fs.writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${SITE}/${p}</loc></url>`).join("\n")}
</urlset>
`);
// shortcut: blanket allow, AI crawlers included on purpose (we want to be cited); /projects/ stays out
fs.writeFileSync("robots.txt", `User-agent: *
Allow: /
Disallow: /projects/

Sitemap: ${SITE}/sitemap.xml
`);
console.log("guide/index.html, llms.txt, sitemap.xml, robots.txt");
