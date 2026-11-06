#!/usr/bin/env python3
"""Bake the per-country survival plan data.

Hazards and risk
  INFORM Risk Index 2025 v0.7.0 (EU Joint Research Centre / IASC), sheet
  "INFORM Risk 2025 (a-z)", scores 0-10. CC BY via the Humanitarian Data
  Exchange: https://data.humdata.org/dataset/inform-risk-index
Emergency numbers
  Wikidata P2852 (emergency phone number) on each country, CC0. Fetch with:
  SELECT ?c ?numLabel WHERE { ?cty wdt:P298 ?c ; wdt:P2852 ?num .
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }

Usage: python3 build_plan.py <inform_risk_2025_v070.xlsx> <wikidata emergency numbers .json>   (needs openpyxl)
Output: plan/plan.json {ISO3: {risk, cls, rank, cope, vuln, h: {hazard: 0-10}, n: [numbers]}}
"""
import json, os, sys
from collections import defaultdict
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
# INFORM column → our hazard key (the plan page holds the guidance for each)
HAZ = {"Earthquake": "earthquake", "River Flood": "flood", "Tsunami": "tsunami", "Tropical Cyclone": "cyclone",
       "Coastal flood": "coastal", "Drought": "drought", "Epidemic": "epidemic",
       "Projected Conflict Probability": "conflict", "Current Conflict Intensity": "war"}

ws = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)["INFORM Risk 2025 (a-z)"]
rows = list(ws.iter_rows(values_only=True))
head = list(rows[1])
col = {name: head.index(name) for name in ["ISO3", "INFORM RISK", "RISK CLASS", "Rank", "VULNERABILITY", "LACK OF COPING CAPACITY", *HAZ]}

nums = defaultdict(set)
for b in json.load(open(sys.argv[2]))["results"]["bindings"]:
    nums[b["c"]["value"]].add(b["numLabel"]["value"])

num = lambda v: round(float(v), 1) if isinstance(v, (int, float)) else None
out = {}
for r in rows[3:]:
    iso = r[col["ISO3"]]
    if not iso or len(iso) != 3:
        continue
    out[iso] = {
        "risk": num(r[col["INFORM RISK"]]), "cls": r[col["RISK CLASS"]], "rank": r[col["Rank"]],
        "vuln": num(r[col["VULNERABILITY"]]), "cope": num(r[col["LACK OF COPING CAPACITY"]]),
        "h": {k: num(r[col[name]]) for name, k in HAZ.items() if num(r[col[name]]) is not None},
        # short numbers first: they are the ones people remember
        "n": sorted(nums.get(iso, []), key=lambda x: (len(x), x)),
    }
for iso in nums:  # places INFORM does not score still get their numbers
    out.setdefault(iso, {"n": sorted(nums[iso], key=lambda x: (len(x), x))})

assert out["JPN"]["h"]["earthquake"] > 8 and out["UKR"]["h"]["war"] > 5 and "911" in out["USA"]["n"], "plan sanity check"
json.dump(out, open(os.path.join(HERE, "plan.json"), "w"), separators=(",", ":"))
print(f"plan.json: {sum(1 for v in out.values() if 'risk' in v)} scored countries, {len(nums)} with emergency numbers")
