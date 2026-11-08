#!/usr/bin/env python3
"""Bake every country's current leaders and cabinet: gov/leaders.json.

Source: CIA "World Leaders — Chiefs of State and Cabinet Members of Foreign
Governments" (US government work, public domain), one page per country,
updated by the CIA as governments change. Read through the site's own Gatsby
page-data JSON.

Usage: python3 build_world.py
Output: gov/leaders.json {ISO3: {name, updated, people: [{name, title}]}}
"""
import json, os, re, time, unicodedata, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = "https://www.cia.gov/resources/world-leaders"
UA = {"User-Agent": "civfm-build/1.0 (+https://civ.fm)"}

def get(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            time.sleep(2)
        except Exception:
            time.sleep(2)
    return None

# the country list lives in one of the index page's static queries
idx = get(f"{SITE}/page-data/foreign-governments/page-data.json")
names = []
for h in idx["staticQueryHashes"]:
    q = get(f"{SITE}/page-data/sq/d/{h}.json") or {}
    nodes = (q.get("data") or {}).get("leaders", {}).get("nodes")
    if nodes: names = [n["country"] for n in nodes]
assert len(names) > 150, "country list not found"

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s.replace("'", "")).strip("-")

W = json.load(open(os.path.join(HERE, "..", "vendor", "world-countries.json")))
key = lambda s: re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower())
ISO = {}
for c in W:
    for n in (c["name"]["common"], c["name"]["official"]):
        ISO[key(n)] = c["cca3"]
for n, iso in {  # CIA spellings that differ from REST Countries
    "Bahamas, The": "BHS", "Gambia, The": "GMB", "Burma": "MMR", "Cabo Verde": "CPV", "Congo, Democratic Republic of the": "COD",
    "Congo, Republic of the": "COG", "Cote d'Ivoire": "CIV", "Korea, North": "PRK", "Korea, South": "KOR", "Micronesia, Federated States of": "FSM",
    "Holy See (Vatican City)": "VAT", "Timor-Leste": "TLS", "Eswatini": "SWZ", "Turkey (Turkiye)": "TUR", "Turkey": "TUR", "Turkiye": "TUR", "Czechia": "CZE",
    "Taiwan": "TWN", "Kosovo": "UNK", "Palestinian Authority": "PSE", "Saint Kitts and Nevis": "KNA", "Saint Lucia": "LCA",
    "Saint Vincent and the Grenadines": "VCT", "Sao Tome and Principe": "STP", "Russia": "RUS", "Syria": "SYR", "Laos": "LAO", "Vietnam": "VNM",
    "Brunei": "BRN", "Iran": "IRN", "Moldova": "MDA", "Tanzania": "TZA", "Venezuela": "VEN", "Bolivia": "BOL", "North Macedonia": "MKD",
}.items():
    ISO[key(n)] = iso

# CIA house abbreviations → words, longest first so "Dep. Prime Min." expands cleanly
ABBR = [("Prime Min.", "Prime Minister"), ("Min.", "Minister"), ("Min ", "Minister "), ("Dep.", "Deputy"), ("Pres.", "President"), ("Fed.", "Federal"),
        ("Chmn.", "Chairman"), ("Sec. Gen.", "Secretary General"), ("Sec.", "Secretary"), ("Gen.", "General"), ("Govt.", "Government"),
        ("Natl.", "National"), ("Dir.", "Director"), ("Amb.", "Ambassador"), ("Pol.", "Policy"), ("Admin.", "Administration"),
        ("Dev.", "Development"), ("Intl.", "International"), ("Comm.", "Commission"), ("Rep.", "Representative"), ("Cdr.", "Commander"),
        (" & ", " and "), (" , ", ", ")]
def words(t):
    for a, b in ABBR: t = t.replace(a, b)
    return re.sub(r"\s+", " ", t).strip()

out, missing = {}, []
for n in names:
    page = None
    for s in dict.fromkeys([slug(n), slug(n.replace(", The", "")), slug(re.sub(r"\(.*?\)", "", n))]):
        page = get(f"{SITE}/page-data/foreign-governments/{s}/page-data.json")
        if page: break
    iso = ISO.get(key(n)) or ISO.get(key(re.sub(r"\(.*?\)", "", n)))
    if not page or not iso:
        missing.append(n); continue
    p = page["result"]["data"]["page"]
    people = [{"name": x["name"], "title": words(x["title"])} for x in (p.get("leaders") or []) + (p.get("leaders_2") or []) + (p.get("leaders_3") or [])
              if x.get("name") and x["name"].upper() != "VACANT"]
    out[iso] = {"name": n, "updated": (p.get("date_updated") or "")[:10], "people": people}
    time.sleep(0.3)  # polite to the CIA site

assert "UKR" in out and any("Prime Minister" in x["title"] for x in out["UKR"]["people"]), "sanity"
json.dump(out, open(os.path.join(HERE, "leaders.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(f"gov/leaders.json: {len(out)} countries; not matched: {missing}")
