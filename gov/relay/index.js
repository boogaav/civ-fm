// Build-time relay for Ukrainian open-data servers that time out from abroad
// but answer Cloudflare's network. Run locally only, never deployed:
//   npx wrangler dev --remote --port 8799   then  GET localhost:8799/?u=<url>
const ALLOW = ["https://openbudget.gov.ua/", "https://public-api.prozorro.gov.ua/", "https://public.api.openprocurement.org/"];
export default {
  async fetch(req) {
    const u = new URL(req.url).searchParams.get("u") || "";
    if (!ALLOW.some((p) => u.startsWith(p))) return new Response(JSON.stringify({ status: 403, body: "not allowed" }));
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(60000) });
      return new Response(JSON.stringify({ status: r.status, body: await r.text() }));
    } catch (e) { return new Response(JSON.stringify({ status: 599, body: String(e) })); }
  },
};
