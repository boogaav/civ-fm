#!/usr/bin/env python3
"""Bake the State and Faith data: political system, religion and the constitution.

Sources
  1. CIA World Factbook, public domain, via github.com/factbook/factbook.json
     (one JSON per country, keyed by GEC code, so countries are matched by
     name against vendor/world-countries.json). Fields used: Government type,
     Legal system, Constitution, Suffrage, Executive branch, Legislative
     branch, Independence, National holiday, Religions.
  2. Constitute Project (constituteproject.org), CC BY-NC 3.0, Comparative
     Constitutions Project: the list of constitutions in force and the
     English HTML of each. The full texts are copied into
     civic/constitutions/<ISO3>.html so they load on networks that block
     third parties; every page links back to Constitute.

Inputs
  <factbook dir>   the unpacked factbook.json tarball (has europe/, africa/, …)
  <constitute dir> constitutions.json (the /service/constitutions list) and
                   one <id>.json per constitution from /service/html

Outputs, next to this script
  civic.json                 {ISO3: {gov, govClass, legal, const, suffrage, chief,
                             head, elect, legis, indep, holiday, religions}}
  constitutions/<ISO3>.html  cleaned HTML fragment of the constitution

Usage: python3 build_civic.py <factbook dir> <constitute dir>
"""
import glob, html, json, os, re, sys, unicodedata
from collections import defaultdict

FB, CP = sys.argv[1], sys.argv[2]
OUT = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(OUT)
facts = json.load(open(os.path.join(ROOT, "vendor", "world-countries.json")))

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = s.lower().replace("&", "and")
    s = re.sub(r"\b(the|of|republic|federal|democratic|people's|peoples|state|kingdom|islamic|united|plurinational|bolivarian|co-operative|cooperative|independent|sovereign|commonwealth|federation|principality|grand duchy|sultanate|hashemite|socialist|arab|oriental|union|territory|territories|special administrative region)\b", " ", s)
    return re.sub(r"[^a-z]+", " ", s).strip()

by_name = {}
for f in facts:
    for n in {f["name"]["common"], f["name"]["official"]}:
        by_name.setdefault(norm(n), f["cca3"])
    by_name.setdefault(norm(f["name"]["common"]).replace(" ", ""), f["cca3"])

OVERRIDE = {
    # factbook short form → ISO3
    "burma": "MMR", "czechia": "CZE", "korea north": "PRK", "korea south": "KOR", "congo democratic": "COD",
    "congo": "COG", "cote d'ivoire": "CIV", "turkey (turkiye)": "TUR", "bahamas, the": "BHS", "gambia, the": "GMB",
    "micronesia, federated states of": "FSM", "holy see (vatican city)": "VAT", "eswatini": "SWZ", "cabo verde": "CPV",
    "timor-leste": "TLS", "macau": "MAC", "taiwan": "TWN", "kosovo": "UNK", "laos": "LAO", "syria": "SYR",
    "russia": "RUS", "iran": "IRN", "vietnam": "VNM", "brunei": "BRN", "bolivia": "BOL", "venezuela": "VEN",
    "tanzania": "TZA", "moldova": "MDA", "north macedonia": "MKD", "saint helena, ascension, and tristan da cunha": "SHN",
    "virgin islands": "VIR", "british virgin islands": "VGB", "falkland islands (islas malvinas)": "FLK",
    "pitcairn islands": "PCN", "south georgia and south sandwich islands": "SGS", "saint martin": "MAF",
    "sint maarten": "SXM", "curacao": "CUW", "svalbard": "SJM", "faroe islands": "FRO", "gaza strip": None, "west bank": "PSE",
    "turkey": "TUR", "federated states of micronesia": "FSM", "united arab emirates": "ARE", "congo (brazzaville)": "COG", "drc": "COD", "congo (kinshasa)": "COD",
    "united states": "USA", "united kingdom": "GBR", "united arab emirates": "ARE", "central african republic": "CAF",
    "dominican republic": "DOM", "marshall islands": "MHL", "solomon islands": "SLB", "cayman islands": "CYM",
    "cook islands": "COK", "turks and caicos islands": "TCA", "northern mariana islands": "MNP", "wallis and futuna": "WLF",
    "saint pierre and miquelon": "SPM", "christmas island": "CXR", "cocos (keeling) islands": "CCK", "norfolk island": "NFK",
    "french polynesia": "PYF", "new caledonia": "NCL", "isle of man": "IMN", "south sudan": "SSD", "sao tome and principe": "STP",
    "trinidad and tobago": "TTO", "antigua and barbuda": "ATG", "saint kitts and nevis": "KNA", "saint lucia": "LCA",
    "saint vincent and the grenadines": "VCT", "bosnia and herzegovina": "BIH", "papua new guinea": "PNG",
    "equatorial guinea": "GNQ", "guinea-bissau": "GNB", "burkina faso": "BFA", "sierra leone": "SLE", "south africa": "ZAF",
    "sri lanka": "LKA", "saudi arabia": "SAU", "costa rica": "CRI", "el salvador": "SLV", "puerto rico": "PRI",
    "american samoa": "ASM", "hong kong": "HKG", "new zealand": "NZL", "san marino": "SMR", "western sahara": "ESH",
    "cabo verde": "CPV", "micronesia federated states": "FSM", "congo republic": "COG", "korea republic": "KOR",
}

def iso_for(name):
    k = name.lower().strip()
    if k in OVERRIDE: return OVERRIDE[k]
    n = norm(name)
    return by_name.get(n) or by_name.get(n.replace(" ", ""))

TAG = re.compile(r"<[^>]+>")
def clean(t, limit=0):
    if not t: return ""
    t = html.unescape(TAG.sub(" ", str(t)))
    t = re.sub(r"\s+", " ", t).strip()
    if limit and len(t) > limit: t = t[:limit].rsplit(" ", 1)[0] + "…"
    return t

def txt(d, *path, limit=0):
    for p in path:
        d = d.get(p) if isinstance(d, dict) else None
        if d is None: return ""
    return clean(d.get("text") if isinstance(d, dict) else d, limit)

# ---- government type → class for the map ----
GOV_CLASSES = ["Absolute monarchy", "Constitutional monarchy", "Parliamentary republic", "Presidential republic",
               "Semi-presidential republic", "One-party state", "Theocracy", "Military or transitional", "Dependency or territory", "Other system"]
def gov_class(g, name):
    s = g.lower()
    if "overseas" in s or "territory" in s or "dependency" in s or "special administrative" in s or "self-governing" in s or "in free association" in s or "unincorporated" in s or "crown dependency" in s: return "Dependency or territory"
    if "communist" in s or "one-party" in s or "single-party" in s: return "One-party state"
    if "theocra" in s or "ecclesiastical" in s or ("emirate" in s and "islamic" in s): return "Theocracy"
    if "authoritarian" in s or "dictatorship" in s: return "One-party state"
    if "military" in s or "transition" in s or "provisional" in s or "interim" in s or "junta" in s: return "Military or transitional"
    if "absolute" in s or "federation of monarchies" in s or ("monarchy" in s and "constitutional" not in s and "parliamentary" not in s): return "Absolute monarchy"
    if "monarchy" in s or "commonwealth realm" in s: return "Constitutional monarchy"
    if "semi-presidential" in s: return "Semi-presidential republic"
    if "presidential" in s or "federal republic" in s and name in ("United States",): return "Presidential republic"
    if "parliamentary" in s: return "Parliamentary republic"
    if "republic" in s: return "Presidential republic" if "president" in s else "Other system"
    return "Other system"

# ---- religions text → shares per family ----
FAMILIES = [
    ("Christian", r"christ|catholic|ekalesia|protestant|orthodox|anglican|evangelic|lutheran|pentecost|baptist|methodist|presbyterian|adventist|church|jehovah|mormon|latter|coptic|apostolic|reformed|calvinis|maronite|kimbangu|zion|episcopal|congregational|moravian|assembl|nazarene|unitarian|born again|charismatic|salvation army|quaker|mennonite|amish|brethren|seventh"),
    ("Muslim", r"muslim|islam|sunni|shia|shi'a|ibadhi|ibadi|ahmadi|alawite|alevi"),
    ("Hindu", r"hindu"),
    ("Buddhist", r"buddhis|lamais"),
    ("Jewish", r"jew|judais"),
    ("Folk and traditional", r"folk|tradition|animis|indigenous|ancest|ethnic religion|shaman|vodou|voodoo|shinto|taois|confucian|kirant|bon\b|spiritis|candombl|umbanda|rastafar|baha|sikh|jain|cao dai|hoa hao|zoroastr|druze|yazid|tenrikyo|local belief|nature"),
    ("Unaffiliated", r"\bnone\b|no religion|unaffiliated|atheis|agnostic|secular|non-religious|nonreligious|not religious|no affiliation|irreligio"),
]
def family(label):
    l = label.lower()
    for fam, rx in FAMILIES:
        if re.search(rx, l): return fam
    return "Other"

def parse_religions(text):
    body = text
    # drop every parenthetical, nested ones included: they hold notes, not shares
    for _ in range(6):
        body = re.sub(r"\([^()]*\)", "", body)
    body = re.sub(r"\b\d{4}(?:-\d{2,4})? est\.?", "", body)
    parts = []
    for seg in re.split(r"[,;]\s*", body):
        m = re.search(r"(?<![\d.])([<>]?\s*\d{1,2}(?:\.\d+)?)\s*%?(?!\d)", seg)
        label = clean(re.sub(r"[<>]?\s*\d{1,2}(?:\.\d+)?(?:-\d{1,2}(?:\.\d+)?)?\s*%?", "", seg)).strip(" ;:-.")
        label = re.sub(r"^(and|or)\s+", "", label)
        if not label or label.lower() in ("est", "note"): continue
        pct = float(m.group(1).replace("<", "").replace(">", "").strip()) if m else None
        parts.append([label[:60], pct])
    fam = defaultdict(float); have = False
    for label, pct in parts:
        if pct is not None:
            fam[family(label)] += pct; have = True
    if have:
        fams = sorted(fam.items(), key=lambda x: -x[1])
        # "other" and "unspecified" never win the colour; a named family does
        top = next((f for f in fams if f[0] != "Other"), fams[0])
        major, share = top[0], round(top[1], 1)
    else:
        fams = []
        major, share = (family(parts[0][0]) if parts else "Other"), None
    return parts[:8], [[k, round(v, 1)] for k, v in fams], major, share

# ---- walk the factbook ----
civic = {}
unmatched = []
for path in glob.glob(os.path.join(FB, "*", "*.json")):
    if "/meta/" in path: continue
    try: d = json.load(open(path))
    except Exception: continue
    g = d.get("Government") or {}
    name = txt(g, "Country name", "conventional short form")
    if not name or name.lower() == "none":
        name = txt(g, "Country name", "conventional long form")
    if not name or name.lower() == "none":
        name = os.path.basename(path)
    iso = iso_for(name)
    if not iso:
        unmatched.append(name); continue
    gov = txt(g, "Government type")
    if not gov: continue
    rel_text = txt(d.get("People and Society", {}), "Religions")
    parts, fams, major, share = parse_religions(rel_text) if rel_text else ([], [], "Other", None)
    civic[iso] = {
        "name": name,
        "gov": gov, "govClass": gov_class(gov, name),
        "legal": txt(g, "Legal system", limit=220),
        "suffrage": txt(g, "Suffrage", limit=120),
        "chief": txt(g, "Executive branch", "chief of state", limit=200),
        "head": txt(g, "Executive branch", "head of government", limit=200),
        "elect": txt(g, "Executive branch", "election/appointment process", limit=300),
        "legis": {
            "name": txt(g, "Legislative branch", "legislature name", limit=120) or txt(g, "Legislative branch", "description", limit=160),
            "structure": txt(g, "Legislative branch", "legislative structure"),
            "seats": txt(g, "Legislative branch", "number of seats", limit=120),
            "system": txt(g, "Legislative branch", "electoral system", limit=120),
            "term": txt(g, "Legislative branch", "term in office", limit=60),
            "women": txt(g, "Legislative branch", "percentage of women in chamber", limit=40),
            "next": txt(g, "Legislative branch", "expected date of next election", limit=60),
        },
        "const": {
            "hist": txt(g, "Constitution", "history", limit=260),
            "amend": txt(g, "Constitution", "amendment process", limit=320),
        },
        "indep": txt(g, "Independence", limit=160),
        "holiday": txt(g, "National holiday", limit=120),
        "religions": {"text": clean(rel_text, 400), "parts": parts, "fam": fams, "major": major, "share": share},
    }

# ---- constitutions ----
cons = json.load(open(os.path.join(CP, "constitutions.json")))
CP_OVERRIDE = {"Bosnia_Herzegovina": "BIH", "Korea_Republic_of": "KOR", "Korea_Peoples_Republic_of": "PRK", "Congo": "COG",
               "Congo_Democratic_Republic_of_the": "COD", "Cote_DIvoire": "CIV", "Cape_Verde": "CPV", "Micronesia": "FSM",
               "Macedonia": "MKD", "Swaziland": "SWZ", "Timor_Leste": "TLS", "Lao_Peoples_Democratic_Republic": "LAO",
               "Syrian_Arab_Republic": "SYR", "Russian_Federation": "RUS", "Iran_Islamic_Republic_of": "IRN", "Viet_Nam": "VNM",
               "Brunei_Darussalam": "BRN", "Bolivia_Plurinational_State_of": "BOL", "Venezuela_Bolivarian_Republic_of": "VEN",
               "Tanzania_United_Republic_of": "TZA", "Moldova_Republic_of": "MDA", "United_States_of_America": "USA",
               "United_Kingdom": "GBR", "United_Arab_Emirates": "ARE", "Myanmar": "MMR", "Czech_Republic": "CZE",
               "Palestine": "PSE", "Kosovo": "UNK", "Taiwan": "TWN", "Eswatini": "SWZ", "Turkey": "TUR", "Gambia": "GMB",
               "Bahamas": "BHS", "Holy_See": "VAT", "Vatican_City": "VAT", "Somalia": "SOM", "Libya": "LBY", "Sudan": "SDN",
               "South_Sudan": "SSD", "Central_African_Republic": "CAF", "Dominican_Republic": "DOM", "Saint_Kitts_and_Nevis": "KNA",
               "Saint_Lucia": "LCA", "Saint_Vincent_and_the_Grenadines": "VCT", "Sao_Tome_and_Principe": "STP",
               "Trinidad_and_Tobago": "TTO", "Antigua_and_Barbuda": "ATG", "Papua_New_Guinea": "PNG", "Equatorial_Guinea": "GNQ",
               "Guinea_Bissau": "GNB", "Burkina_Faso": "BFA", "Sierra_Leone": "SLE", "South_Africa": "ZAF", "Sri_Lanka": "LKA",
               "Saudi_Arabia": "SAU", "Costa_Rica": "CRI", "El_Salvador": "SLV", "New_Zealand": "NZL", "San_Marino": "SMR",
               "Marshall_Islands": "MHL", "Solomon_Islands": "SLB", "Cook_Islands": "COK", "Niue": "NIU"}
os.makedirs(os.path.join(OUT, "constitutions"), exist_ok=True)
got = 0; no_file = []; cp_unmatched = []
for c in cons:
    if not (c.get("in_force") and c.get("public")): continue
    cid = c["country_id"]
    iso = CP_OVERRIDE.get(cid) or iso_for(cid.replace("_", " ")) or iso_for(c["country"])
    if not iso:
        cp_unmatched.append(cid); continue
    rec = civic.setdefault(iso, {"name": c["country"], "gov": "", "govClass": "Other system", "religions": {"text": "", "parts": [], "fam": [], "major": "Other", "share": None}, "const": {}, "legis": {}})
    src = os.path.join(CP, c["id"] + ".json")
    local = False
    if os.path.exists(src) and os.path.getsize(src) > 2000:
        try:
            h = json.load(open(src)).get("html", "")
            h = re.sub(r"<!--.*?-->", "", h, flags=re.S)
            h = re.sub(r'\s(data-topics|data-languages|data-[a-z-]+)="[^"]*"', "", h)
            h = re.sub(r'<div class="constitution-topics"></div>', "", h)
            h = re.sub(r"\n{2,}", "\n", h).strip()
            if len(h) > 2000:
                open(os.path.join(OUT, "constitutions", iso + ".html"), "w").write(h)
                local = True; got += 1
        except Exception: pass
    if not local: no_file.append(c["id"])
    rec["const"].update({
        "id": c["id"], "title": c.get("title_long") or c["title"], "enacted": c.get("year_enacted"),
        "revised": c.get("year_updated") or c.get("year_revised"), "words": c.get("word_length"),
        "amended": c.get("years_amended"), "local": local,
    })

json.dump({"sources": {"factbook": "CIA World Factbook (public domain), via factbook/factbook.json",
                       "constitute": "Constitute Project, Comparative Constitutions Project, CC BY-NC 3.0"},
           "govClasses": GOV_CLASSES, "c": civic},
          open(os.path.join(OUT, "civic.json"), "w"), separators=(",", ":"), ensure_ascii=False)
print(f"{len(civic)} countries; {got} constitution texts; factbook unmatched: {unmatched}")
print(f"constitute unmatched: {cp_unmatched}; without text: {no_file[:12]} ({len(no_file)})")
print("civic.json", os.path.getsize(os.path.join(OUT, "civic.json")) // 1024, "KB; constitutions",
      sum(os.path.getsize(p) for p in glob.glob(os.path.join(OUT, "constitutions", "*.html"))) // 1048576, "MB")
from collections import Counter
print(Counter(v["govClass"] for v in civic.values()))
print(Counter(v["religions"]["major"] for v in civic.values()))
