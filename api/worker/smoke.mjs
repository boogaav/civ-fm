// Live smoke test for civfm-api: every REST route and the MCP handshake.
//   node smoke.mjs [base]    (default https://civfm-api.boogaav.workers.dev)
import assert from "node:assert/strict";
const B = process.argv[2] || "https://civfm-api.boogaav.workers.dev";
const get = async (p) => { const r = await fetch(B + p); return [r.status, await r.json()]; };
const rpc = async (method, params, id = 1) => (await (await fetch(B + "/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) })).json());

let [s, d] = await get("/v1/country/ukraine");
assert.equal(s, 200); assert.equal(d.country.iso3, "UKR"); assert.ok(d.state.constitution.year); assert.ok(d.indicators.population.value > 3e7);
assert.equal(d.links.migration.emigrants_live_in[0].iso3, "RUS");
[s, d] = await get("/v1/country/DE"); assert.equal(d.country.iso3, "DEU"); assert.ok(d.taxes.corporate_rate_pct > 20);
[s, d] = await get("/v1/rank?indicator=life_expectancy&limit=5&region=Europe"); assert.equal(d.results.length, 5); assert.equal(d.results[0].region, "Europe");
[s, d] = await get("/v1/compare?c=France,Poland"); assert.equal(d.countries.length, 2);
[s, d] = await get("/v1/links/mexico?type=migration"); assert.equal(d.emigrants_live_in[0].iso3, "USA");
[s, d] = await get("/v1/constitution/usa?q=freedom of speech"); assert.ok(d.matches.length >= 1, "US speech clause");
[s, d] = await get("/v1/topic?q=right to health care"); assert.ok(d.constitutions_with_topic > 50);
[s, d] = await get("/v1/country/atlantis"); assert.equal(s, 404);
[s, d] = await get("/v1/rank?indicator=no such thing!"); assert.equal(s, 400);

d = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
assert.equal(d.result.serverInfo.name, "civ-fm");
d = await rpc("tools/list", {}); assert.equal(d.result.tools.length, 6);
d = await rpc("tools/call", { name: "rank_countries", arguments: { indicator: "gdp_per_capita_ppp", limit: 3 } }); assert.equal(d.result.structuredContent.results.length, 3);
d = await rpc("tools/call", { name: "get_country_profile", arguments: { country: "Nowhere" } }); assert.equal(d.result.isError, true);
console.log("civfm-api smoke: all checks passed");
