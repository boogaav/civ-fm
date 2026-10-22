#!/usr/bin/env python3
"""Build the Constitution Atlas database: every constitution in force, exact text.

Source: Constitute Project (constituteproject.org, CC BY-NC 3.0). Each text is
the English translation Constitute publishes, split into its own sections, with
the expert topic tags Constitute attaches to each section (399-topic ontology).

Inputs  <constitute dir> holding constitutions.json (/service/constitutions?lang=en),
        topics.json (/service/topics?lang=en) and <cons_id>.json per text
        (/service/html?cons_id=…&lang=en).
Outputs next to this script
  atlas.sqlite  full database (constitutions, sections, topics, tags, similarity,
                shared passages, FTS5 search over every section)
  d1.sql        same schema + rows as SQL for Cloudflare D1 (no FTS virtual table
                rows; D1 rebuilds it with the trigger-free INSERT … SELECT at the end)
  atlas.json    compact graph + per-country summary for the explorer page
Usage: python3 build_atlas.py <constitute dir>
"""
import json, os, re, sys, sqlite3, math, hashlib
from html.parser import HTMLParser
from collections import defaultdict, Counter
import numpy as np

CP = sys.argv[1]
OUT = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(OUT))
civic = json.load(open(os.path.join(ROOT, "civic", "civic.json")))["c"]
facts = {f["cca3"]: f for f in json.load(open(os.path.join(ROOT, "vendor", "world-countries.json")))}
meta = {c["id"]: c for c in json.load(open(os.path.join(CP, "constitutions.json")))}

# ---- which text stands for which country ----
cid_iso = {v["const"]["id"]: iso for iso, v in civic.items()
           if v.get("const", {}).get("id") in meta and meta[v["const"]["id"]].get("in_force")}
cid_iso.update({"Congo_2015": "COG", "Peoples_Republic_of_Korea_2016": "PRK"})
# Constitutions suspended or replaced since Constitute's last update: keep the
# latest text Constitute has, flagged so the page can say so.
SUPERSEDED = {
    "Burkina_Faso_2015": ("BFA", "Suspended after the 2022 coups; transitional charter in force"),
    "Central_African_Republic_2016": ("CAF", "Replaced by the 2023 constitution (not yet on Constitute)"),
    "Chad_2018": ("TCD", "Replaced by the 2023 constitution (not yet on Constitute)"),
    "Gabon_2011": ("GAB", "Replaced by the 2024 constitution (not yet on Constitute)"),
    "Guinea_2010": ("GIN", "Replaced by the 2025 constitution (not yet on Constitute)"),
    "Oman_2011": ("OMN", "Replaced by the 2021 Basic Statute (not yet on Constitute)"),
    "Syria_2012": ("SYR", "Replaced by the 2025 constitutional declaration (not yet on Constitute)"),
}
status = {}
for cid in cid_iso: status[cid] = ("in_force", "")
for cid, (iso, note) in SUPERSEDED.items():
    cid_iso[cid] = iso; status[cid] = ("superseded", note)

# ---- topic tree ----
tree = json.load(open(os.path.join(CP, "topics.json")))
topics, groups = {}, []
def walk(nodes, group, sub):
    for t in nodes:
        if group is None:
            groups.append((t["key"], t["label"])); walk(t.get("topics", []), t["key"], None)
        elif t.get("topics"):
            walk(t["topics"], group, t["label"])
        elif t["key"] not in topics:
            topics[t["key"]] = (t["key"], t["label"], group, sub or "", t.get("description", "") or "")
walk(tree, None, None)

# ---- parse one constitution into sections ----
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.stack = []; s.secs = []; s.cur = None; s.buf = None; s.tag = None; s.title = ""
        s.intitle = False
    def handle_starttag(s, tag, a):
        a = dict(a)
        if tag == "div" and a.get("class") == "section":
            sid = a["id"].split("/", 1)[1]
            parent = next((x for x in reversed(s.stack) if x is not None), None)
            sec = {"sid": sid, "parent": parent["sid"] if parent else None,
                   "level": sum(1 for x in s.stack if x is not None), "kind": "", "heading": "", "text": [],
                   "topics": [u.rsplit("/", 1)[-1] for u in (a.get("data-topics") or "").split(",") if u]}
            s.secs.append(sec); s.stack.append(sec)
        elif tag == "div":
            s.stack.append(None)
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            if tag == "h1" and not s.stack: s.intitle = True
            s.buf = []; s.tag = tag
        elif tag in ("p", "li"):
            s.buf = []; s.tag = tag
    def handle_endtag(s, tag):
        if tag == "div":
            if s.stack: s.stack.pop()
        elif tag == s.tag and s.buf is not None:
            txt = re.sub(r"\s+", " ", "".join(s.buf)).strip()
            if s.intitle: s.title = txt; s.intitle = False
            else:
                sec = next((x for x in reversed(s.stack) if x is not None), None)
                if sec is not None and txt:
                    if tag[0] == "h": sec["heading"] = txt; sec["kind"] = "title"
                    else:
                        sec["text"].append(("• " if tag == "li" else "") + txt)
                        if not sec["kind"]: sec["kind"] = "list" if tag == "li" else "body"
            s.buf = None; s.tag = None
    def handle_data(s, d):
        if s.buf is not None: s.buf.append(d)

ART = re.compile(r"^(article|art\.|section|§)\s*[\dIVXLC]", re.I)
WORD = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)?")
cons, sections, tags = [], [], []
for cid, iso in sorted(cid_iso.items(), key=lambda x: x[1]):
    path = os.path.join(CP, cid + ".json")
    if not os.path.exists(path): print("missing", cid); continue
    raw = json.load(open(path))
    p = P(); p.feed(raw.get("html", ""))
    m = meta[cid]
    words = 0; arts = 0; tset = Counter()
    for s in p.secs:
        body = "\n".join(s["text"])
        words += len(body.split()) + len(s["heading"].split())
        if s["heading"] and ART.match(s["heading"]): arts += 1
        for k in s["topics"]:
            if k in topics: tags.append((iso, s["sid"], k)); tset[k] += 1
        if s["heading"] or body:
            sections.append((iso, s["sid"], s["parent"], s["level"], s["kind"], s["heading"], body))
    f = facts.get(iso, {})
    st, note = status[cid]
    cons.append({
        "iso": iso, "name": f.get("name", {}).get("common", m["country"]), "cid": cid,
        "title": raw.get("title") or m.get("title"), "year": int(m["year_enacted"]) if m.get("year_enacted") else None,
        "revised": int(m["year_updated"] or m["year_revised"] or 0) or None,
        "region": f.get("region", m.get("region", "")), "subregion": f.get("subregion", ""),
        "status": st, "note": note, "words": words, "articles": arts,
        "latlng": f.get("latlng") or [0, 0], "topics": tset,
        "url": f"https://www.constituteproject.org/constitution/{cid}",
    })
print(len(cons), "constitutions,", len(sections), "sections,", len(tags), "topic tags")
isos = [c["iso"] for c in cons]; N = len(isos); ix = {iso: i for i, iso in enumerate(isos)}

# ---- 1. structure similarity: Jaccard over topic sets ----
tkeys = sorted(topics); tix = {k: i for i, k in enumerate(tkeys)}
T = np.zeros((N, len(tkeys)))
for c in cons:
    for k in c["topics"]: T[ix[c["iso"]], tix[k]] = 1
inter = T @ T.T; cnt = T.sum(1)
union = cnt[:, None] + cnt[None, :] - inter
JAC = np.where(union > 0, inter / np.maximum(union, 1), 0)

# ---- 2. wording similarity: TF-IDF cosine over the full text ----
docs = defaultdict(Counter)
for iso, sid, par, lvl, kind, head, body in sections:
    docs[iso].update(WORD.findall((head + " " + body).lower()))
STOP = set("the of and to in a or be by any for shall is as on with which that its an are this it not from at may other such all their has have law laws state article section".split())
df = Counter()
for d in docs.values(): df.update(d.keys())
vocab = [w for w, n in df.items() if 2 <= n <= N * 0.9 and w not in STOP and len(w) > 2]
vix = {w: i for i, w in enumerate(vocab)}
X = np.zeros((N, len(vocab)))
idf = np.array([math.log(N / df[w]) for w in vocab])
for iso, d in docs.items():
    r = ix[iso]
    for w, n in d.items():
        j = vix.get(w)
        if j is not None: X[r, j] = 1 + math.log(n)
X *= idf; X /= np.linalg.norm(X, axis=1, keepdims=True) + 1e-9
COS = X @ X.T
# distinctive words per constitution: highest tf-idf terms
distinct = {}
for iso in isos:
    row = X[ix[iso]]
    distinct[iso] = [vocab[j] for j in np.argsort(-row)[:12]]

# ---- 3. shared passages: paragraphs whose 7-word shingles match another country's ----
K = 7
def shingles(text):
    w = WORD.findall(text.lower())
    return {hash(" ".join(w[i:i + K])) for i in range(len(w) - K + 1)}
paras = []   # (iso, sid, shingle set)
for iso, sid, par, lvl, kind, head, body in sections:
    if len(body.split()) >= 18:
        sh = shingles(body)
        if len(sh) >= 10: paras.append((iso, sid, sh))
owners = defaultdict(set)
for iso, sid, sh in paras:
    for h in sh: owners[h].add(iso)
GENERIC = 12   # a phrase in more than 12 constitutions is boilerplate, not borrowing
index = defaultdict(list)
for pi, (iso, sid, sh) in enumerate(paras):
    for h in sh:
        if 2 <= len(owners[h]) <= GENERIC: index[h].append(pi)
pairs = {}
for pi, (iso, sid, sh) in enumerate(paras):
    hits = Counter()
    for h in sh:
        for pj in index.get(h, ()):
            if pj > pi and paras[pj][0] != iso: hits[pj] += 1
    for pj, n in hits.items():
        ov = n / min(len(sh), len(paras[pj][2]))
        if ov >= 0.5:
            a, b = (pi, pj)
            pairs[(a, b)] = round(ov, 3)
shared = []
for (a, b), ov in pairs.items():
    ia, sa, _ = paras[a]; ib, sb, _ = paras[b]
    if ia > ib: ia, sa, ib, sb = ib, sb, ia, sa
    shared.append((ia, sa, ib, sb, ov))
SH = np.zeros((N, N), dtype=np.float32)
for ia, sa, ib, sb, ov in shared:
    SH[ix[ia], ix[ib]] += 1; SH[ix[ib], ix[ia]] += 1
print(len(paras), "paragraphs checked,", len(shared), "shared passages")

# ---- combined similarity + families (Louvain on a k-nearest-neighbour graph) ----
def z(M):
    v = M[~np.eye(N, dtype=bool)]
    return (M - v.mean()) / (v.std() + 1e-9)
COMB = 0.3 * z(JAC) + 0.7 * z(COS)
KNN = 6
W = np.zeros((N, N))
for i in range(N):
    order = [j for j in np.argsort(-COMB[i]) if j != i][:KNN]
    for j in order:
        w = max(0.05, 0.3 * JAC[i, j] + 0.7 * COS[i, j])
        W[i, j] = W[j, i] = max(W[i, j], w)

def louvain_level(W, rng):
    n = len(W); comm = np.arange(n); m2 = W.sum(); deg = W.sum(1)
    improved = True
    while improved:
        improved = False
        for i in rng.permutation(n):
            ci = comm[i]; tot = defaultdict(float); link = defaultdict(float)
            for j in range(n): tot[comm[j]] += deg[j]
            for j in range(n):
                if j != i and W[i, j] > 0: link[comm[j]] += W[i, j]
            tot[ci] -= deg[i]
            best, gain = ci, link.get(ci, 0) - tot[ci] * deg[i] / m2
            for c, l in link.items():
                g = l - tot[c] * deg[i] / m2
                if g > gain + 1e-12: best, gain = c, g
            if best != ci: comm[i] = best; improved = True
    return comm

def louvain(W, seed=7):
    rng = np.random.default_rng(seed)
    n = len(W); comm = louvain_level(W, rng)
    # aggregate one level so small groups merge into families
    labels = {c: k for k, c in enumerate(sorted(set(comm)))}
    comm = np.array([labels[c] for c in comm]); K2 = len(labels)
    W2 = np.zeros((K2, K2))
    for i in range(n):
        for j in range(n): W2[comm[i], comm[j]] += W[i, j]
    if K2 > 14:
        sub = louvain_level(W2, rng)
        comm = np.array([sub[c] for c in comm])
    labels = {c: k for k, c in enumerate(sorted(set(comm), key=lambda c: -np.sum(comm == c)))}
    return [labels[c] for c in comm]

fam = louvain(W)
# a family is named after the tradition its anchor member stands for (first match wins)
FAMILY_NAMES = [("FRA", "Francophone civil-law"), ("PRT", "Lusophone"), ("JAM", "Caribbean Commonwealth"),
                ("GBR", "Westminster core"), ("KEN", "Anglophone Africa & Asia"), ("MUS", "Small-island Commonwealth"),
                ("BRA", "Latin American & Iberian"), ("SRB", "Former Yugoslav"), ("POL", "Post-Soviet & Eastern bloc"),
                ("EGY", "Arab & Islamic"), ("DEU", "German-speaking"), ("SWE", "Nordic & Benelux monarchies"),
                ("USA", "American presidential"), ("CHN", "Socialist")]
F = max(fam) + 1
# name each family by its most over-represented topics and its biggest members
fam_info = []
for k in range(F):
    mem = [i for i in range(N) if fam[i] == k]
    share = T[mem].mean(0); rest = T[[i for i in range(N) if fam[i] != k]].mean(0)
    lift = [(share[j] - rest[j], tkeys[j]) for j in range(len(tkeys)) if share[j] >= 0.5]
    lift.sort(reverse=True)
    regions = Counter(cons[i]["region"] for i in mem).most_common(2)
    words = Counter()
    for i in mem: words.update(distinct[isos[i]][:6])
    names = [n for a, n in FAMILY_NAMES if a in {isos[i] for i in mem}]
    fam_info.append({"k": k, "n": len(mem), "name": names[0] if names else f"Family {k + 1}",
                     "members": sorted((isos[i] for i in mem), key=lambda iso: -cons[ix[iso]]["words"]),
                     "regions": [r for r, _ in regions],
                     "marks": [topics[t][1] for _, t in lift[:6]],
                     "lacks": [topics[t][1] for d, t in sorted(((share[j] - rest[j], tkeys[j]) for j in range(len(tkeys)) if rest[j] >= 0.5))[:4]],
                     "words": [w for w, _ in words.most_common(8)]})

# ---- write SQLite ----
db_path = os.path.join(OUT, "atlas.sqlite")
if os.path.exists(db_path): os.remove(db_path)
db = sqlite3.connect(db_path)
SCHEMA = """
CREATE TABLE constitutions (iso TEXT PRIMARY KEY, name TEXT, cons_id TEXT, title TEXT, year_enacted INTEGER,
  year_revised INTEGER, region TEXT, subregion TEXT, status TEXT, status_note TEXT, words INTEGER,
  articles INTEGER, topics INTEGER, family INTEGER, distinct_words TEXT, source_url TEXT);
CREATE TABLE sections (iso TEXT, sid TEXT, parent_sid TEXT, level INTEGER, kind TEXT, heading TEXT, body TEXT,
  PRIMARY KEY (iso, sid));
CREATE TABLE topics (key TEXT PRIMARY KEY, label TEXT, grp TEXT, subgroup TEXT, description TEXT, n_constitutions INTEGER);
CREATE TABLE section_topics (iso TEXT, sid TEXT, topic TEXT);
CREATE INDEX st_topic ON section_topics(topic, iso);
CREATE INDEX st_sec ON section_topics(iso, sid);
CREATE TABLE similarity (a TEXT, b TEXT, structure REAL, wording REAL, shared_passages INTEGER, PRIMARY KEY (a, b));
CREATE TABLE shared_passages (a TEXT, sid_a TEXT, b TEXT, sid_b TEXT, overlap REAL);
CREATE INDEX sp_ab ON shared_passages(a, b);
CREATE INDEX sp_b ON shared_passages(b, a);
CREATE TABLE families (family INTEGER PRIMARY KEY, size INTEGER, marks TEXT, lacks TEXT, words TEXT);
"""
db.executescript(SCHEMA)
ntop = Counter(); [ntop.update(c["topics"].keys()) for c in cons]
crow = [(c["iso"], c["name"], c["cid"], c["title"], c["year"], c["revised"], c["region"], c["subregion"], c["status"],
         c["note"], c["words"], c["articles"], len(c["topics"]), fam[ix[c["iso"]]], ", ".join(distinct[c["iso"]]), c["url"])
        for c in cons]
db.executemany("INSERT INTO constitutions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", crow)
db.executemany("INSERT INTO sections VALUES (?,?,?,?,?,?,?)", sections)
db.executemany("INSERT INTO topics VALUES (?,?,?,?,?,?)", [t + (ntop[t[0]],) for t in topics.values()])
db.executemany("INSERT INTO section_topics VALUES (?,?,?)", tags)
sim = [(isos[i], isos[j], round(float(JAC[i, j]), 4), round(float(COS[i, j]), 4), int(SH[i, j]))
       for i in range(N) for j in range(N) if i < j]
db.executemany("INSERT INTO similarity VALUES (?,?,?,?,?)", sim)
db.executemany("INSERT INTO shared_passages VALUES (?,?,?,?,?)", shared)
db.executemany("INSERT INTO families VALUES (?,?,?,?,?)",
               [(f["k"], f["n"], "; ".join(f["marks"]), "; ".join(f["lacks"]), ", ".join(f["words"])) for f in fam_info])
db.executescript("""
CREATE VIRTUAL TABLE sections_fts USING fts5(heading, body, iso UNINDEXED, sid UNINDEXED, tokenize='porter');
INSERT INTO sections_fts (heading, body, iso, sid) SELECT heading, body, iso, sid FROM sections;
""")
db.commit()

# ---- D1 dump (schema + data; FTS built server-side by the final INSERT … SELECT) ----
with open(os.path.join(OUT, "d1.sql"), "w") as f:
    for t in ("sections_fts", "constitutions", "sections", "topics", "section_topics", "similarity", "shared_passages", "families"):
        f.write(f"DROP TABLE IF EXISTS {t};\n")
    for line in db.iterdump():
        if line.startswith(("BEGIN", "COMMIT")) or "sections_fts" in line or line.startswith("INSERT INTO \"sqlite_"): continue
        if line.startswith("CREATE TABLE IF NOT EXISTS") or line.startswith("PRAGMA"): continue
        f.write(line + "\n")
    f.write("CREATE VIRTUAL TABLE sections_fts USING fts5(heading, body, iso UNINDEXED, sid UNINDEXED, tokenize='porter');\n")
    f.write("INSERT INTO sections_fts (heading, body, iso, sid) SELECT heading, body, iso, sid FROM sections;\n")
db.close()

# ---- explorer JSON ----
gtop = {g: [] for g, _ in groups}
for k, (key, label, g, sub, desc) in topics.items(): gtop[g].append(key)
top_shared = sorted(shared, key=lambda r: -r[4])
sec_text = {(r[0], r[1]): (r[5], r[6]) for r in sections}
def snippet(iso, sid):
    h, b = sec_text.get((iso, sid), ("", ""))
    return b[:420]
pair_pass = defaultdict(list)
for ia, sa, ib, sb, ov in top_shared:
    if len(pair_pass[(ia, ib)]) < 4: pair_pass[(ia, ib)].append([sa, sb, ov])
out = {
    "source": "Constitute Project (constituteproject.org), CC BY-NC 3.0 — English texts",
    "built": "2026-10-22",
    "groups": [{"k": g, "label": l} for g, l in groups],
    "topics": [{"k": k, "label": topics[k][1], "g": topics[k][2], "sub": topics[k][3], "n": ntop[k]} for k in tkeys],
    "cons": [{"iso": c["iso"], "name": c["name"], "title": c["title"], "year": c["year"], "rev": c["revised"],
              "region": c["region"], "sub": c["subregion"], "status": c["status"], "note": c["note"],
              "words": c["words"], "arts": c["articles"], "fam": fam[ix[c["iso"]]], "ll": c["latlng"],
              "t": sorted(tix[k] for k in c["topics"]), "dw": distinct[c["iso"]][:8], "cid": c["cid"]} for c in cons],
    "families": fam_info,
    # full similarity matrices, rounded to 3 decimals, as flat upper triangles
    "jac": [round(float(JAC[i, j]), 3) for i in range(N) for j in range(i + 1, N)],
    "cos": [round(float(COS[i, j]), 3) for i in range(N) for j in range(i + 1, N)],
    "sh": [int(SH[i, j]) for i in range(N) for j in range(i + 1, N)],
    "edges": [[i, j, round(float(W[i, j]), 3)] for i in range(N) for j in range(i + 1, N) if W[i, j] > 0],
    "passages": {f"{a}|{b}": [[sa, sb, ov, snippet(a, sa), snippet(b, sb)] for sa, sb, ov in v] for (a, b), v in pair_pass.items()},
}
json.dump(out, open(os.path.join(OUT, "atlas.json"), "w"), separators=(",", ":"), ensure_ascii=False)
print("families:", [(f["n"], f["members"][:4], f["marks"][:3]) for f in fam_info])
print("db", os.path.getsize(db_path) // 1e6, "MB; atlas.json", os.path.getsize(os.path.join(OUT, "atlas.json")) // 1e3, "KB")
