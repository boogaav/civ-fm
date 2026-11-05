#!/usr/bin/env python3
"""Bake each country's strongest links for the globe's Links mode.

Migration (Home)
  UN DESA International Migrant Stock 2024 (bilateral, both sexes), via Our
  World in Data's catalog table migrant_stock_dest_origin.parquet. Stocks, not
  flows: people born in A and living in B at mid-2024.
Trade (Money)
  CEPII BACI (HS22 release), goods trade reconciled from UN Comtrade's
  exporter and importer reports, latest year in the release. Licence Ouverte
  2.0 (Etalab): commercial reuse allowed with attribution, unlike raw Comtrade.
  https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37

Usage: python3 build_links.py <migrant parquet> <unzipped BACI dir>
       (needs pyarrow for the parquet)
Output: links/migration.json {year, c: {ISO3: {out: [[ISO3, people]..], in: [..], outT, inT}}}
        links/trade.json     {c: {ISO3: {y, x: [[ISO3, usd]..], m: [..], xT, mT}}}
"""
import json, os, sys, unicodedata
import pyarrow.parquet as pq

HERE = os.path.dirname(os.path.abspath(__file__))
TOP = 10
W = json.load(open(os.path.join(HERE, "..", "vendor", "world-countries.json")))

def norm(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s.lower()) if c.isalnum())

ISO = {}
for c in W:
    for n in [c["name"]["common"], c["name"]["official"]]:
        ISO[norm(n)] = c["cca3"]
# names OWID/UN spell differently from REST Countries
for n, iso in {
    "Democratic Republic of Congo": "COD", "Congo": "COG", "Cote d'Ivoire": "CIV", "Cape Verde": "CPV",
    "East Timor": "TLS", "Micronesia (country)": "FSM", "Palestine": "PSE", "Russia": "RUS", "Syria": "SYR",
    "Laos": "LAO", "Moldova": "MDA", "Iran": "IRN", "Vietnam": "VNM", "Brunei": "BRN", "Bolivia": "BOL",
    "Venezuela": "VEN", "Tanzania": "TZA", "South Korea": "KOR", "North Korea": "PRK", "Eswatini": "SWZ",
    "Curacao": "CUW", "Sint Maarten (Dutch part)": "SXM", "Saint Martin (French part)": "MAF",
    "United States Virgin Islands": "VIR", "British Virgin Islands": "VGB", "Falkland Islands": "FLK",
    "Wallis and Futuna": "WLF", "Saint Barthelemy": "BLM", "Reunion": "REU", "Macao": "MAC", "Hong Kong": "HKG",
    "Czechia": "CZE", "Turkey": "TUR", "Kosovo": "UNK", "Taiwan": "TWN", "Vatican": "VAT",
    "Bonaire Sint Eustatius and Saba": "BES", "Saint Helena": "SHN", "Channel Islands": None,
}.items():
    ISO[norm(n)] = iso

def top(d):
    return sorted(([k, v] for k, v in d.items() if v > 0), key=lambda x: -x[1])[:TOP]

# ---- migration ----
t = pq.read_table(sys.argv[1]).to_pylist()
year = max(r["year"] for r in t)
out, inn, miss = {}, {}, set()
for r in t:
    if r["year"] != year or r["gender"] != "all":
        continue
    o, d = ISO.get(norm(r["country_origin"]), False), ISO.get(norm(r["country_destination"]), False)
    if o is False: miss.add(r["country_origin"])
    if d is False: miss.add(r["country_destination"])
    if not o or not d or o == d:
        continue  # regions, "Other", unmatched
    out.setdefault(o, {})[d] = out.setdefault(o, {}).get(d, 0) + r["migrants"]
    inn.setdefault(d, {})[o] = inn.setdefault(d, {}).get(o, 0) + r["migrants"]
mig = {iso: {"out": top(out.get(iso, {})), "in": top(inn.get(iso, {})),
             "outT": sum(out.get(iso, {}).values()), "inT": sum(inn.get(iso, {}).values())}
       for iso in set(out) | set(inn)}
assert mig["UKR"]["out"][0][0] == "RUS" and mig["USA"]["in"][0][0] == "MEX", "migration sanity check"
json.dump({"year": year, "c": mig}, open(os.path.join(HERE, "migration.json"), "w"), separators=(",", ":"))
print(f"migration {year}: {len(mig)} countries; unmatched names (regions are expected):",
      sorted(m for m in miss if not any(w in m for w in ("countries", "Africa", "Asia", "Europe", "America", "Oceania", "region", "Other", "World", "income", "Caribbean", "Melanesia", "Micronesia", "Polynesia", "Sahara", "Australia and New Zealand", "Small Island"))))

# ---- trade ----
import csv, glob
bd = sys.argv[2]
codes = {r["country_code"]: r["country_iso3"] for r in csv.DictReader(open(glob.glob(os.path.join(bd, "country_codes_*.csv"))[0], encoding="utf-8"))}
yfile = max(glob.glob(os.path.join(bd, "BACI_HS22_Y*_V*.csv")))  # latest year
tyear = int(os.path.basename(yfile).split("_Y")[1][:4])
pair = {}
with open(yfile, encoding="utf-8") as f:
    for r in csv.DictReader(f):  # t, i (exporter), j (importer), k (HS6), v (thousand US$), q
        key = (r["i"], r["j"])
        pair[key] = pair.get(key, 0) + float(r["v"])
X, M = {}, {}
for (i, j), v in pair.items():
    a, b = codes.get(i), codes.get(j)
    if not a or not b or a == b:
        continue
    X.setdefault(a, {})[b] = v * 1000
    M.setdefault(b, {})[a] = v * 1000
trade = {}
for iso in set(X) | set(M):
    x, m = X.get(iso, {}), M.get(iso, {})
    trade[iso] = {"y": tyear, "x": [[k, round(v)] for k, v in top(x)], "m": [[k, round(v)] for k, v in top(m)],
                  "xT": round(sum(x.values())), "mT": round(sum(m.values()))}
assert trade["UKR"]["x"][0][0] in ("POL", "CHN", "ROU", "TUR", "DEU", "ESP", "HUN"), trade["UKR"]["x"][:3]
assert trade["MEX"]["x"][0][0] == "USA" and trade["CAN"]["x"][0][0] == "USA", "trade sanity check"
json.dump({"year": tyear, "c": trade}, open(os.path.join(HERE, "trade.json"), "w"), separators=(",", ":"))
print(f"trade {tyear}: {len(trade)} countries")
