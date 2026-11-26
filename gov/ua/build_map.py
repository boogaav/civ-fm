#!/usr/bin/env python3
"""Ukraine budget map layers: gov/ua/map.geojson.

Regions: geoBoundaries UKR ADM1 simplified (CC BY 4.0, wmgeolab), joined to
Open Budget's regional totals (gov/ua.json "regions", 2026 to date, all local
budgets of the region) and Wikidata population (gov/ua/territories.json).
Cities: the city budgets in gov/ua.json (2025), placed at the city's
coordinates from the territory tree.

Usage: python3 build_map.py <geoBoundaries-UKR-ADM1_simplified.geojson>
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
G = json.load(open(sys.argv[1]))
D = json.load(open(os.path.join(HERE, "..", "ua.json")))
T = json.load(open(os.path.join(HERE, "territories.json")))

# Open Budget region ids (1..27, Ukrainian alphabetical) → geoBoundaries names
EN = ["Autonomous Republic of Crimea", "Vinnytsia Oblast", "Volyn Oblast", "Dnipropetrovsk Oblast", "Donetsk Oblast", "Zhytomyr Oblast",
      "Zakarpattia Oblast", "Zaporizhia Oblast", "Ivano-Frankivsk Oblast", "Kyiv Oblast", "Kirovohrad Oblast", "Luhansk Oblast", "Lviv Oblast",
      "Mykolaiv Oblast", "Odessa Oblast", "Poltava Oblast", "Rivne Oblast", "Sumy Oblast", "Ternopil Oblast", "Kharkiv Oblast", "Kherson Oblast",
      "Khmelnytskyi Oblast", "Cherkasy Oblast", "Chernivtsi Oblast", "Chernihiv Oblast", "Kyiv", "Sevastopol"]
money = {EN[int(r["id"]) - 1]: r for r in D["regions"]}
pop = {}
regions = sorted((t for t in T if t["level"] == "region"), key=lambda t: t["id"])  # KATOTTG order = same alphabetical order
for t, en in zip(regions, EN): pop[en] = (t.get("population"), t["id"], t["name"]["uk"])

def rnd(c):
    return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 3), round(c[1], 3)]

feats = []
for f in G["features"]:
    en = f["properties"]["shapeName"]
    m, (p, code, uk) = money.get(en, {}), pop.get(en, (None, None, None))
    occupied = en in ("Autonomous Republic of Crimea", "Sevastopol")
    feats.append({"type": "Feature", "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])},
                  "properties": {"kind": "region", "en": en.replace("Odessa", "Odesa").replace("Zaporizhia", "Zaporizhzhia"), "uk": uk, "code": code,
                                 "revenue": m.get("revenue"), "spending": m.get("spending"), "population": p,
                                 "pc": round(m["spending"] * 1e9 / p) if m.get("spending") and p and not occupied else None, "occupied": occupied}})

cities = {}
for t in T:
    if t["level"] == "settlement" and t.get("centre") and t["name"]["en"]:
        k = t["name"]["en"]
        if t.get("population", 0) > cities.get(k, {}).get("population", 0): cities[k] = t
for l in D["locals"]:
    if l["kind"] == "oblast": continue
    # Kyiv is a region-level unit in KATOTTG, not a settlement: use its own entry
    c = next((t for t in T if t["id"].startswith("UA80") and t["level"] == "region"), None) if l["name"] == "Kyiv" else None
    c = c or cities.get(l["name"]) or cities.get({"Zaporizhzhia": "Zaporizhzhia", "Dnipro": "Dnipro"}.get(l["name"], ""))
    if not c: print("no coords for", l["name"]); continue
    lat, lng = c["centre"]
    feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lng, lat]},
                  "properties": {"kind": "city", "en": l["name"], "uk": c["name"]["uk"], "budget": l["code"], "katottg": c["id"], "hromada": c.get("parent"), "revenue": l["revenue"],
                                 "spending": l["spending"], "population": c.get("population"),
                                 "pc": round(l["spending"] * 1e9 / c["population"]) if c.get("population") else None}})

kyiv = next(f for f in feats if f["properties"]["kind"] == "city" and f["properties"]["en"] == "Kyiv")
assert 30 < kyiv["geometry"]["coordinates"][0] < 31 and 50 < kyiv["geometry"]["coordinates"][1] < 51, "Kyiv misplaced"
assert sum(1 for f in feats if f["properties"]["kind"] == "region" and f["properties"]["spending"]) >= 24, "region join failed"
json.dump({"type": "FeatureCollection", "features": feats}, open(os.path.join(HERE, "map.geojson"), "w"), ensure_ascii=False, separators=(",", ":"))
print("map.geojson:", len(feats), "features;", sum(1 for f in feats if f["properties"]["kind"] == "city"), "cities")
