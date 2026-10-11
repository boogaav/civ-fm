#!/usr/bin/env python3
"""Bake the Place channel's dataset: sub-national human development.

Source: Global Data Lab, Subnational Human Development Database
(globaldatalab.org/shdi), via the Open Numbers mirror
github.com/open-numbers/ddf--gdl--shdi (CC BY). The mirror carries
1990 to 2019 for 1,774 regions. GDL's own release runs to 2022 but needs a
free account; the same script works on their CSV once the columns are mapped.

Inputs (one directory, fetched with `gh api … -H "Accept: application/vnd.github.raw"`
because raw.githubusercontent.com is blocked on some networks):
  ddf--entities--level--subnat.csv, ddf--entities--level--national.csv
  ddf--datapoints--{shdi,lifexp,msch,esch,gnic,pop}--by--subnat--year.csv
  nat--{shdi,lifexp,msch,esch,gnic,pop}.csv   (the --by--national-- files, renamed)
  shdi2022_world_large_simpl_0.21pct.json      (TopoJSON, assets/)

Outputs, next to this script:
  regions.json  TopoJSON, properties {g: GDL code, a: ISO3, n: region name}
  data.json     {years, r: {GDL code: {hdi, life, msch, esch, gni, pop}}, n: {ISO3: …}}
                each indicator is a list aligned with `years`, null where missing.

Usage: python3 build_place.py <input dir>
"""
import csv, json, sys, os
from collections import defaultdict

IN = sys.argv[1]
OUT = os.path.dirname(os.path.abspath(__file__))
YEARS = [1990, 1995, 2000] + list(range(2005, 2020))
IND = {"shdi": "hdi", "lifexp": "life", "msch": "msch", "esch": "esch", "gnic": "gni", "pop": "pop"}
ROUND = {"hdi": 3, "life": 1, "msch": 1, "esch": 1, "gni": -1, "pop": 0}

def read(path):
    with open(os.path.join(IN, path), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def series(rows, key, col):
    by = defaultdict(dict)
    for r in rows:
        if r[col] in ("", "nan"):
            continue
        by[r[key]][int(r["year"])] = float(r[col])
    return by

def pack(by, code, name):
    s = by.get(code, {})
    nd = ROUND[name]
    out = []
    for y in YEARS:
        v = s.get(y)
        out.append(None if v is None else (round(v, nd) if nd > 0 else int(round(v, nd))))
    return out

sub_ent = {r["subnat"]: r for r in read("ddf--entities--level--subnat.csv")}
nat_ent = {r["national"]: r for r in read("ddf--entities--level--national.csv")}
iso_of_nat = {k: v["iso_code"] for k, v in nat_ent.items()}

sub = {}
nat = {}
for src, name in IND.items():
    sub[name] = series(read(f"ddf--datapoints--{src}--by--subnat--year.csv"), "subnat", src)
    nat[name] = series(read(f"nat--{src}.csv"), "national", src)

topo = json.load(open(os.path.join(IN, "shdi2022_world_large_simpl_0.21pct.json")))
obj_name = next(iter(topo["objects"]))
geoms = topo["objects"][obj_name]["geometries"]

regions = {}
kept = []
missing = []
for g in geoms:
    if not g.get("type"):
        continue  # a few codes carry no geometry
    code = g["properties"]["gdlcode"]
    low = code.lower()
    iso = g["properties"]["iso_code"]
    if low.endswith("t"):
        # a whole country drawn as one region: use the national series
        ent = nat_ent.get(low)
        label = ent["name"] if ent else iso
        rec = {n: pack(nat[n], low, n) for n in IND.values()}
    else:
        ent = sub_ent.get(low)
        label = ent["name"].split(" - ", 1)[-1] if ent else code
        rec = {n: pack(sub[n], low, n) for n in IND.values()}
    if all(v is None for v in rec["hdi"]):
        missing.append(code)
    regions[code] = rec
    g["properties"] = {"g": code, "a": iso, "n": label}
    kept.append(g)

topo["objects"] = {"regions": {"type": "GeometryCollection", "geometries": kept}}

national = {}
for key, ent in nat_ent.items():
    iso = ent["iso_code"]
    national[iso] = {n: pack(nat[n], key, n) for n in IND.values()}

json.dump(topo, open(os.path.join(OUT, "regions.json"), "w"), separators=(",", ":"), ensure_ascii=False)
json.dump(
    {
        "source": "Global Data Lab, Subnational HDI (via Open Numbers mirror), 1990-2019",
        "years": YEARS,
        "r": regions,
        "n": national,
    },
    open(os.path.join(OUT, "data.json"), "w"), separators=(",", ":"), ensure_ascii=False,
)
print(f"{len(kept)} regions, {len(national)} countries, {len(missing)} regions without HDI: {missing[:10]}")
for f in ("regions.json", "data.json"):
    print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB")
