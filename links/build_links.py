#!/usr/bin/env python3
"""Bake each country's strongest links for the globe's Links mode.

Migration (Home)
  UN DESA International Migrant Stock 2024 (bilateral, both sexes), via Our
  World in Data's catalog table migrant_stock_dest_origin.parquet. Stocks, not
  flows: people born in A and living in B at mid-2024.
Trade (Money)
  UN Comtrade, goods only, all products (HS TOTAL), as each country reported
  its own exports and imports by partner, latest year 2021-2024. Cached raw
  responses from fetch_trade.py, one JSON per reporter and flow.

Usage: python3 build_links.py <migrant parquet> <comtrade dir with trade_raw/ and partners.json>
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
cd = sys.argv[2]
P = {p["PartnerCode"]: p.get("PartnerCodeIsoAlpha3") for p in json.load(open(os.path.join(cd, "partners.json")))["results"] if not p["isGroup"]}
P[490] = "TWN"  # Comtrade's "Other Asia, nes" is Taiwan
trade = {}
for f in sorted(os.listdir(os.path.join(cd, "trade_raw"))):
    iso, flow = f[:-5].split("_")
    d = json.load(open(os.path.join(cd, "trade_raw", f)))
    if not d["data"]:
        continue
    by = {}
    for r in d["data"]:
        p = P.get(r["p"])
        if p and len(p) == 3 and not p.startswith("_") and p != iso and r["v"]:
            by[p] = by.get(p, 0) + r["v"]
    e = trade.setdefault(iso, {"y": d["year"]})
    e["y"] = max(e["y"], d["year"])
    e["x" if flow == "X" else "m"] = [[k, round(v)] for k, v in top(by)]
    e["xT" if flow == "X" else "mT"] = round(sum(by.values()))
assert trade["UKR"]["x"][0][0] in ("POL", "CHN", "ROU", "TUR", "DEU"), "trade sanity check"
json.dump({"c": trade}, open(os.path.join(HERE, "trade.json"), "w"), separators=(",", ":"))
print(f"trade: {len(trade)} reporters")
