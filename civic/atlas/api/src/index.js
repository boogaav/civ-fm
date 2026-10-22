// Constitution Atlas API — read-only window onto the D1 "constitutions" database.
//   GET /                       index of routes
//   GET /constitutions          every constitution (metadata, family)
//   GET /c/:iso                 one constitution: metadata + every section, in order
//   GET /search?q=&iso=&limit=  full-text search over every section (FTS5, porter stemming)
//   GET /topic/:key?iso=        sections tagged with a topic (all countries, or one)
//   GET /topics                 the topic ontology with how many constitutions use each
//   GET /pair/:a/:b             similarity of two constitutions + their shared passages, with text
//   GET /similar/:iso?by=wording|structure|shared_passages
// Source texts: Constitute Project (constituteproject.org), CC BY-NC 3.0.

const H = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*",
            "cache-control": "public, max-age=3600" };
const json = (x, s = 200) => new Response(JSON.stringify(x), { status: s, headers: H });
const ISO = /^[A-Z]{3}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    const q = (k) => url.searchParams.get(k);
    const db = env.DB;
    try {
      if (!p.length) return json({
        name: "Constitution Atlas API", source: "Constitute Project, CC BY-NC 3.0",
        routes: ["/constitutions", "/c/UKR", "/search?q=dignity", "/topic/god", "/topics", "/pair/FRA/SEN", "/similar/UKR?by=wording"],
      });
      if (p[0] === "constitutions")
        return json((await db.prepare("SELECT * FROM constitutions ORDER BY name").all()).results);
      if (p[0] === "topics")
        return json((await db.prepare("SELECT * FROM topics ORDER BY n_constitutions DESC").all()).results);
      if (p[0] === "c" && ISO.test(p[1] || "")) {
        const [c, s, t] = await db.batch([
          db.prepare("SELECT * FROM constitutions WHERE iso=?").bind(p[1]),
          db.prepare("SELECT sid, parent_sid, level, kind, heading, body FROM sections WHERE iso=? ORDER BY rowid").bind(p[1]),
          db.prepare("SELECT sid, group_concat(topic) AS topics FROM section_topics WHERE iso=? GROUP BY sid").bind(p[1]),
        ]);
        if (!c.results.length) return json({ error: "not found" }, 404);
        const tags = Object.fromEntries(t.results.map((r) => [r.sid, r.topics.split(",")]));
        return json({ ...c.results[0], sections: s.results.map((r) => ({ ...r, topics: tags[r.sid] || [] })) });
      }
      if (p[0] === "search") {
        const term = (q("q") || "").trim().slice(0, 200);
        if (!term) return json({ error: "q required" }, 400);
        // quote each word so user punctuation can't break FTS syntax; words are ANDed
        const match = term.split(/\s+/).map((w) => '"' + w.replace(/"/g, "") + '"').join(" ");
        const iso = q("iso"); const lim = Math.min(+q("limit") || 50, 500);
        const sql = `SELECT iso, sid, heading, snippet(sections_fts, 1, '«', '»', ' … ', 40) AS snip FROM sections_fts
                     WHERE sections_fts MATCH ?${iso && ISO.test(iso) ? " AND iso=?" : ""} ORDER BY rank LIMIT ?`;
        const args = iso && ISO.test(iso) ? [match, iso, lim] : [match, lim];
        const hits = (await db.prepare(sql).bind(...args).all()).results;
        const per = (await db.prepare(`SELECT iso, count(*) AS n FROM sections_fts WHERE sections_fts MATCH ? GROUP BY iso ORDER BY n DESC`).bind(match).all()).results;
        return json({ q: term, countries: per, hits });
      }
      if (p[0] === "topic" && p[1]) {
        const iso = q("iso");
        const sql = `SELECT st.iso, st.sid, s.heading, substr(s.body, 1, 600) AS body FROM section_topics st
                     JOIN sections s ON s.iso=st.iso AND s.sid=st.sid WHERE st.topic=?${iso && ISO.test(iso) ? " AND st.iso=?" : ""}
                     ORDER BY st.iso LIMIT 2000`;
        const rows = (await db.prepare(sql).bind(...(iso && ISO.test(iso) ? [p[1], iso] : [p[1]])).all()).results;
        const topic = await db.prepare("SELECT * FROM topics WHERE key=?").bind(p[1]).first();
        return json({ topic, sections: rows });
      }
      if (p[0] === "pair" && ISO.test(p[1] || "") && ISO.test(p[2] || "")) {
        const [a, b] = [p[1], p[2]].sort();
        const [sim, sh, ta, tb] = await db.batch([
          db.prepare("SELECT * FROM similarity WHERE a=? AND b=?").bind(a, b),
          db.prepare(`SELECT sp.overlap, sp.sid_a, sp.sid_b, x.heading AS head_a, x.body AS body_a, y.heading AS head_b, y.body AS body_b
                      FROM shared_passages sp JOIN sections x ON x.iso=sp.a AND x.sid=sp.sid_a
                      JOIN sections y ON y.iso=sp.b AND y.sid=sp.sid_b WHERE sp.a=? AND sp.b=? ORDER BY sp.overlap DESC LIMIT 60`).bind(a, b),
          db.prepare("SELECT DISTINCT topic FROM section_topics WHERE iso=?").bind(a),
          db.prepare("SELECT DISTINCT topic FROM section_topics WHERE iso=?").bind(b),
        ]);
        const A = new Set(ta.results.map((r) => r.topic)), B = new Set(tb.results.map((r) => r.topic));
        return json({ a, b, ...(sim.results[0] || {}), passages: sh.results,
          both: [...A].filter((k) => B.has(k)), only_a: [...A].filter((k) => !B.has(k)), only_b: [...B].filter((k) => !A.has(k)) });
      }
      if (p[0] === "similar" && ISO.test(p[1] || "")) {
        const by = ["wording", "structure", "shared_passages"].includes(q("by")) ? q("by") : "wording";
        const rows = (await db.prepare(`SELECT CASE WHEN a=?1 THEN b ELSE a END AS iso, structure, wording, shared_passages
                     FROM similarity WHERE a=?1 OR b=?1 ORDER BY ${by} DESC LIMIT 25`).bind(p[1]).all()).results;
        return json({ iso: p[1], by, similar: rows });
      }
      return json({ error: "unknown route" }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  },
};
