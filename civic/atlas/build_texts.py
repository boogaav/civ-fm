#!/usr/bin/env python3
"""Split atlas.sqlite into one small JSON per constitution for the explorer page.
data/<ISO>.json = {"iso", "s": [[sid, level, kind, heading, body, [topic index…]], …]}
Topic indexes point into atlas.json "topics". Run after build_atlas.py."""
import json, os, sqlite3
from collections import defaultdict
OUT = os.path.dirname(os.path.abspath(__file__))
db = sqlite3.connect(os.path.join(OUT, "atlas.sqlite"))
tix = {t["k"]: i for i, t in enumerate(json.load(open(os.path.join(OUT, "atlas.json")))["topics"])}
os.makedirs(os.path.join(OUT, "data"), exist_ok=True)
tags = defaultdict(list)
for iso, sid, k in db.execute("SELECT iso, sid, topic FROM section_topics"): tags[(iso, sid)].append(tix[k])
total = 0
for (iso,) in db.execute("SELECT iso FROM constitutions").fetchall():
    rows = [[sid, lvl, kind, head, body, sorted(set(tags.get((iso, sid), [])))]
            for sid, lvl, kind, head, body in db.execute(
                "SELECT sid, level, kind, heading, body FROM sections WHERE iso=? ORDER BY rowid", (iso,))]
    p = os.path.join(OUT, "data", iso + ".json")
    json.dump({"iso": iso, "s": rows}, open(p, "w"), separators=(",", ":"), ensure_ascii=False)
    total += os.path.getsize(p)
print("texts", total // 1e6, "MB")
