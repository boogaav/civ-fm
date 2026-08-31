// civfm-proxy — adds CORS + 5-minute edge caching to open data feeds
// that don't send Access-Control-Allow-Origin themselves.
// Allowlist only: this is not a general-purpose proxy.

const ROUTES = {
  "/gdacs": "https://www.gdacs.org/xml/gdacs.geojson",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const target = ROUTES[url.pathname];
    if (!target) return json({ error: "unknown route" }, 404);

    const cache = caches.default;
    const cacheKey = new Request(url.origin + url.pathname);
    let res = await cache.match(cacheKey);
    if (res) return res;

    const upstream = await fetch(target, {
      headers: { "User-Agent": "civfm (civfm.booga.me)" },
    });
    if (!upstream.ok) return json({ error: `upstream ${upstream.status}` }, 502);

    res = new Response(upstream.body, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};
