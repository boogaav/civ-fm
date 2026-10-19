#!/usr/bin/env python3
"""Bake the constitution comparison: which topics every constitution shares.

The Constitute Project tags every section of every constitution with topics
from one ontology (399 topics in 12 groups: rights, legislature, judiciary,
amendment, …). The raw /service/html JSON carries them as data-topics
attributes; this script reads those, so it needs the raw files, not the
cleaned copies in civic/constitutions/.

Inputs
  <constitute dir>  constitutions.json (the /service/constitutions list),
                    topics.json (the /service/topics?lang=en tree) and one
                    <id>.json per constitution in force.
Output, next to this script
  compare.json  {
    topics:  [{k, label, desc, group, share, n}]        share = fraction of constitutions
    groups:  [{k, label}]
    cons:    [{iso, name, cid, year, region, n, t:[topic idx…], x, y}]   x,y = 2-D layout
    secs:    {topic k: {iso: [section id, …]}}           up to 3 per pair, for quotes
  }
Usage: python3 build_compare.py <constitute dir>
"""
import json, os, re, sys, math
from collections import defaultdict

CP = sys.argv[1]
OUT = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(OUT)
civic = json.load(open(os.path.join(OUT, "civic.json")))["c"]
facts = {f["cca3"]: f for f in json.load(open(os.path.join(ROOT, "vendor", "world-countries.json")))}
cid_to_iso = {v["const"]["id"]: iso for iso, v in civic.items() if v.get("const", {}).get("id")}

# ---- topic tree ----
tree = json.load(open(os.path.join(CP, "topics.json")))
topics, groups = {}, []
def walk(nodes, group):
    for t in nodes:
        if group is None:
            groups.append({"k": t["key"], "label": t["label"]})
            walk(t.get("topics", []), t["key"])
        else:
            topics[t["key"]] = {"k": t["key"], "label": t["label"], "desc": t.get("description", ""), "group": group}
            walk(t.get("topics", []), group)
walk(tree, None)

# ---- per constitution: topic set + section ids ----
SEC = re.compile(r'<div id="(section/\d+)" class="section" data-topics="([^"]*)"')
cons, secs = [], defaultdict(lambda: defaultdict(list))
meta = {c["id"]: c for c in json.load(open(os.path.join(CP, "constitutions.json")))}
for cid, iso in cid_to_iso.items():
    path = os.path.join(CP, cid + ".json")
    if not os.path.exists(path): continue
    html = json.load(open(path)).get("html", "")
    keys = set()
    for sid, raw in SEC.findall(html):
        for uri in raw.split(","):
            k = uri.rsplit("/", 1)[-1]
            if k in topics:
                keys.add(k)
                if len(secs[k][iso]) < 3: secs[k][iso].append(sid)
    if not keys: continue
    m = meta.get(cid, {})
    cons.append({
        "iso": iso, "name": facts[iso]["name"]["common"] if iso in facts else m.get("country", cid),
        "cid": cid, "year": m.get("year_enacted"), "region": facts.get(iso, {}).get("region", m.get("region", "")),
        "keys": keys,
    })
n = len(cons)

# ---- shares ----
count = defaultdict(int)
for c in cons:
    for k in c["keys"]: count[k] += 1
order = sorted(topics, key=lambda k: (-count[k], topics[k]["label"]))
idx = {k: i for i, k in enumerate(order)}
tlist = [{**topics[k], "n": count[k], "share": round(count[k] / n, 3)} for k in order]

# ---- 2-D layout: classical MDS on Jaccard distance (pure python) ----
def jaccard(a, b):
    u = len(a | b)
    return 1 - len(a & b) / u if u else 1.0
D = [[jaccard(a["keys"], b["keys"]) for b in cons] for a in cons]
# double centring
D2 = [[d * d for d in row] for row in D]
rm = [sum(r) / n for r in D2]
cm = [sum(D2[i][j] for i in range(n)) / n for j in range(n)]
gm = sum(rm) / n
B = [[-0.5 * (D2[i][j] - rm[i] - cm[j] + gm) for j in range(n)] for i in range(n)]
def power_iter(M, k):
    vecs, vals = [], []
    M = [row[:] for row in M]
    for _ in range(k):
        v = [1.0 + 0.01 * i for i in range(n)]
        for _ in range(200):
            w = [sum(M[i][j] * v[j] for j in range(n)) for i in range(n)]
            norm = math.sqrt(sum(x * x for x in w)) or 1
            v = [x / norm for x in w]
        lam = sum(v[i] * sum(M[i][j] * v[j] for j in range(n)) for i in range(n))
        vecs.append(v); vals.append(lam)
        for i in range(n):
            for j in range(n): M[i][j] -= lam * v[i] * v[j]
    return vecs, vals
(v1, v2), (l1, l2) = power_iter(B, 2)
xs = [v1[i] * math.sqrt(max(l1, 0)) for i in range(n)]
ys = [v2[i] * math.sqrt(max(l2, 0)) for i in range(n)]
sx = max(abs(x) for x in xs) or 1; sy = max(abs(y) for y in ys) or 1

out_cons = []
for i, c in enumerate(cons):
    out_cons.append({
        "iso": c["iso"], "name": c["name"], "cid": c["cid"], "year": c["year"], "region": c["region"],
        "n": len(c["keys"]), "t": sorted(idx[k] for k in c["keys"]),
        "x": round(xs[i] / sx, 3), "y": round(ys[i] / sy, 3),
    })
json.dump({
    "source": "Constitute Project (Comparative Constitutions Project), CC BY-NC 3.0; topic ontology and section tags are theirs",
    "n": n, "topics": tlist, "groups": groups, "cons": out_cons,
    "secs": {k: dict(v) for k, v in secs.items()},
}, open(os.path.join(OUT, "compare.json"), "w"), separators=(",", ":"), ensure_ascii=False)
print(f"{n} constitutions, {len(tlist)} topics; compare.json {os.path.getsize(os.path.join(OUT, 'compare.json')) // 1024} KB")
print("top 12:", [(t['label'], t['share']) for t in tlist[:12]])
print("eigen", round(l1, 2), round(l2, 2))
