#!/usr/bin/env python3
"""Ukraine's territory tree: every region, district, community (hromada) and
settlement, keyed by its official KATOTTG code.

Source: Wikidata (CC0), property P9435 "KATOTTH ID", which carries the official
codifier of administrative-territorial units (Ministry of Development of
Communities). Pulled one region at a time so each SPARQL query stays small.

KATOTTG code: UA + 2 region + 2 district + 3 community + 3 settlement +
3 city district + 5 check digits. A level's lower segments are zero, so the
parent is the unit whose code agrees on every higher segment.

Usage: python3 build_territories.py     Output: gov/ua/territories.json
"""
import json, os, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "civfm-build/1.0 (https://civ.fm)", "Accept": "application/sparql-results+json"}
REGIONS = ["01", "05", "07", "12", "14", "18", "21", "23", "26", "32", "35", "44", "46", "48", "51", "53", "56", "59", "61", "63",
           "65", "68", "71", "73", "74", "80", "85"]  # Crimea … Kyiv, Sevastopol: first two digits of every KATOTTG code

Q = """SELECT ?item ?code ?uk ?en ?pop ?coord ?head ?headLabel ?headStart WHERE {
  ?item wdt:P9435 ?code . FILTER(STRSTARTS(?code, "UA%s"))
  OPTIONAL { ?item rdfs:label ?uk . FILTER(LANG(?uk) = "uk") }
  OPTIONAL { ?item rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item wdt:P1082 ?pop }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item p:P6 ?hs . ?hs ps:P6 ?head . FILTER NOT EXISTS { ?hs pq:P582 ?e } OPTIONAL { ?hs pq:P580 ?headStart }
             SERVICE wikibase:label { bd:serviceParam wikibase:language "uk,en". ?head rdfs:label ?headLabel } }
}"""

def sparql(q):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:
            print("  retry", attempt, e); time.sleep(10 * (attempt + 1))
    raise RuntimeError("SPARQL failed")

def level(code):  # which segment is the last non-zero one
    d = code[2:]
    segs = [d[0:2], d[2:4], d[4:7], d[7:10], d[10:12]]
    names = ["region", "district", "hromada", "settlement", "city_district"]
    lv = 0
    for i, s in enumerate(segs):
        if int(s): lv = i
    return names[lv], lv

rows = {}
for r in REGIONS:
    bs = sparql(Q % r)
    for b in bs:
        code = b["code"]["value"]
        # some codes also sit on Wikimedia category items ("Категорія:…"); those are not places
        if any(b.get(k, {}).get("value", "").startswith(("Категорія:", "Category:")) for k in ("uk", "en")): continue
        t = rows.setdefault(code, {"id": code, "wd": b["item"]["value"].rsplit("/", 1)[1]})
        t["name"] = {"uk": b.get("uk", {}).get("value"), "en": b.get("en", {}).get("value")}
        if "pop" in b: t["population"] = max(t.get("population", 0), int(float(b["pop"]["value"])))
        if "coord" in b:
            lng, lat = b["coord"]["value"][6:-1].split()
            t["centre"] = [round(float(lat), 4), round(float(lng), 4)]
        if "head" in b:
            t["head"] = {"name": b["headLabel"]["value"], "wd": b["head"]["value"].rsplit("/", 1)[1],
                         "since": b.get("headStart", {}).get("value", "")[:10] or None}
    print(r, len(bs), "rows")
    time.sleep(2)

# levels and parents from the code itself
by_prefix = {}
for code, t in rows.items():
    t["level"], lv = level(code)
    widths = [2, 4, 7, 10, 12]
    by_prefix[(lv, code[2:2 + widths[lv]])] = code
for code, t in rows.items():
    lv = ["region", "district", "hromada", "settlement", "city_district"].index(t["level"])
    widths = [2, 4, 7, 10, 12]
    for up in range(lv - 1, -1, -1):
        p = by_prefix.get((up, code[2:2 + widths[up]]))
        if p: t["parent"] = p; break

# Occupation authorities are not Ukraine's government: Crimea and Sevastopol
# are wholly occupied; in the partly occupied regions Wikidata can carry
# Russian-installed local heads, so only the (Ukrainian) regional head stays.
# shortcut: status is region-wide only; load the official list of occupied and
# frontline communities (Ministry of Reintegration order) for hromada-level status
for code, t in rows.items():
    if code[2:4] in ("01", "85"):
        t["status"] = "occupied"; t.pop("head", None)
    elif code[2:4] in ("14", "44", "23", "65") and t["level"] != "region":
        t.pop("head", None)
assert not any((t["name"]["uk"] or "").startswith("Категорія") for t in rows.values()), "category items leaked"
assert not any("head" in t for c, t in rows.items() if c[2:4] in ("01", "85")), "occupation heads leaked"

assert sum(1 for t in rows.values() if t["level"] == "hromada") > 1300, "too few hromadas"
assert any((t["name"]["uk"] or "").startswith("Київ") for t in rows.values() if t["level"] == "region"), "Kyiv missing"
json.dump(sorted(rows.values(), key=lambda t: t["id"]), open(os.path.join(HERE, "territories.json"), "w"), ensure_ascii=False, separators=(",", ":"))
from collections import Counter
print("gov/ua/territories.json:", len(rows), dict(Counter(t["level"] for t in rows.values())),
      "with head:", sum(1 for t in rows.values() if "head" in t))
