#!/usr/bin/env python3
"""Bake "who holds power" per country: up to 100 people with Wikipedia links.

There is no dataset of "the most powerful people"; this ranks what can be
known from Wikidata (CC0):
  1. living people who currently hold a position whose jurisdiction or
     country is this one (P39 with no end time, person without date of
     death), scored by what the position is: head of state, head of
     government, ministers, speakers, top judges, central bank, military
     chiefs, regional governors, party leaders, big-city mayors, religious
     leaders, legislators;
  2. the richest citizens by declared net worth (P2218).
Within a tier, the number of Wikipedia language editions with an article
(sitelinks) breaks ties, as a rough measure of prominence.

Also computes the current leader's time in office for the map: head of
government in parliamentary systems and constitutional monarchies, head of
state elsewhere (per civic.json govClass).

Usage: python3 build_power.py [ISO3 ...]   (no args = every country in civic.json)
Output: civic/power/<ISO3>.json and civic/power/index.json
"""
import csv, io, json, math, os, re, sys, time, urllib.parse, urllib.request
from datetime import date

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "power")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(OUT, exist_ok=True)
UA = "civfm/0.1 (civ.fm; boogaav@gmail.com)"
facts = {f["cca3"]: f for f in json.load(open(os.path.join(ROOT, "vendor", "world-countries.json")))}
civic = json.load(open(os.path.join(os.path.dirname(OUT), "civic.json")))["c"]
YEAR = date.today().year

def sparql(q):
    for t in range(3):
        try:
            req = urllib.request.Request("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q}), headers={"Accept": "text/csv", "User-Agent": UA})
            return list(csv.DictReader(io.StringIO(urllib.request.urlopen(req, timeout=150).read().decode("utf-8"))))
        except Exception as e:
            if t == 2: print("  sparql failed:", str(e)[:80], flush=True)
            time.sleep(4)
    return []

Q_POS = '''SELECT ?p ?pLabel ?pos ?posLabel ?sl ?start ?article WHERE {
  ?c wdt:P297 "%s" .
  ?p wdt:P31 wd:Q5; p:P39 ?st . ?st ps:P39 ?pos . FILTER NOT EXISTS { ?st pq:P582 ?end }
  FILTER NOT EXISTS { ?p wdt:P570 ?dead }
  OPTIONAL { ?st pq:P580 ?start }
  { ?pos wdt:P1001 ?c } UNION { ?pos wdt:P17 ?c }
  ?p wikibase:sitelinks ?sl .
  OPTIONAL { ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY DESC(?sl) LIMIT 600'''
Q_RICH = '''SELECT ?p ?pLabel ?nw ?sl ?article WHERE {
  ?c wdt:P297 "%s" .
  ?p wdt:P31 wd:Q5; wdt:P27 ?c; wdt:P2218 ?nw . FILTER NOT EXISTS { ?p wdt:P570 ?dead }
  ?p wikibase:sitelinks ?sl .
  OPTIONAL { ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY DESC(?nw) LIMIT 40'''

# Tiers, first match wins. The top ones must name the country itself, so a
# jury president, a university president or a regional prime minister cannot
# outrank the head of state.
EXCLUDE = re.compile(r"jury|university|academy|institute|museum|theatre|theater|library|orchestra|opera|club|federation|association|committee|olympic|company|corporation|foundation|society|union of (writers|artists|journalists|composers)|researcher|rector|professor|player|coach|dean|lecturer|footballer|artist|curator|librarian|editor|chamber of commerce|guild|SAG|world bank|united nations|european|african union|nato|imf|fifa|uefa", re.I)
HEADS = r"president|king|queen|emperor|empress|sultan|emir|grand duke|sovereign prince|prince|monarch|supreme leader|captain regent|co-prince|yang di-pertuan agong|governor-general|federal president|head of state|chairman of the presidential council|chairman of the state affairs commission"
GOVS = r"prime minister|federal chancellor|chancellor|premier|taoiseach|president of the government|president of the council of ministers|chief executive|chairman of the council of ministers|minister-president|first minister|head of government|state counsellor"

def make_tiers(names):
    C = "(?:the )?(?:" + "|".join(re.escape(n) for n in names) + ")"
    return [
        ("other", 0, EXCLUDE.pattern),
        ("faith", 45, r"patriarch|pope|archbishop|cardinal|chief rabbi|grand mufti|metropolitan|primate|supreme patriarch|sangharaja|dalai lama|catholicos|bishops' conference|conference of .*bishops|episcopal conference|imam of|grand imam|moderator of"),
        ("parliament", 72, r"(speaker|president|chairman|chairperson|chair|president pro tempore) of (the )?(senate|parliament|national assembly|house of|chamber|congress|verkhovna|bundestag|bundesrat|sejm|diet|duma|federation council|legislative|lok sabha|rajya sabha|knesset|storting|riksdag|folketing|eduskunta|cortes|assembly|shura|majlis|national council)"),
        ("state", 100, rf"^(?:{HEADS}) of {C}$|^(?:{HEADS})$"),
        ("government", 95, rf"^(?:{GOVS}) of {C}$|^(?:{GOVS})$"),
        ("government", 75, rf"^(vice president|vice-president|deputy prime minister|vice premier|deputy chancellor|vice chancellor) of {C}|^(vice president|deputy prime minister|vice premier)\b"),
        ("region", 45, rf"^(prime minister|premier|governor|chief minister|minister-president|president|head|chairman of the government|chairman) of (?!{C}$)(the )?(.*(oblast|region|province|republic|krai|territory|state|canton|land|county|island|district|autonomous|emirate)|[A-Z].*)"),
        ("party", 32, r"shadow |leader of the opposition|opposition leader"),
        ("government", 40, r"under-secretary|under secretary|parliamentary secretary|deputy minister|vice minister|vice-minister|state secretary|secretary of state for .* (digital|culture|sport|environment|transport)"),
        ("government", 68, r"(minister|secretary) (of|for) (defen|finance|foreign|interior|home affairs|economy|justice|state|treasury|the interior|external affairs)|secretary of state$|attorney general|chancellor of the exchequer|home secretary|foreign secretary"),
        ("court", 66, r"chief justice|president of the (supreme|constitutional|federal constitutional|high) court|chief judge|president of the court of cassation|president of the council of state"),
        ("money", 65, r"(governor|president|chairman|chair) of the (central bank|national bank|reserve bank|federal reserve|bank of|monetary authority|state bank|people's bank)"),
        ("military", 62, r"chief of (the )?(general staff|defence staff|defense staff|staff|army|naval|air)|commander[- ]in[- ]chief|chairman of the joint chiefs|chief of defence|chief of the defence force|supreme commander|minister of war|head of the (security service|intelligence)"),
        ("government", 55, r"\bminister\b|secretary of|cabinet secretary|commissioner-general|director of (the )?(central intelligence|national intelligence|fbi|security service|federal security)|head of the office of the president|chief of staff of the president"),
        ("party", 50, r"(leader|chairman|chairperson|chair|president|general secretary|first secretary|secretary-general|secretary general) of (the )?.*(party|movement|alliance|bloc|front|league)"),
        ("region", 40, r"^(mayor|head|governor) of |lord mayor|city mayor|mayor-president|chief executive of (the )?(city|municipality)"),
        ("court", 35, r"(justice|judge) of the (supreme|constitutional|federal|high)"),
        ("parliament", 22, r"member of|deputy|senator|representative|\bmp\b|people's deputy|congress(man|woman)|assemblyman|assemblywoman|legislator"),
        ("state", 30, r"first lady|first gentleman|crown prince|crown princess|heir apparent"),
        ("other", 12, r"ambassador|envoy|consul|high commissioner"),
    ]

def tier(label, tiers):
    l = label.lower()
    for kind, w, rx in tiers:
        if re.search(rx, l, re.I): return kind, w
    return "other", 15

def bake(iso):
    cc = facts[iso]["cca2"]
    f = facts[iso]
    names = {f["name"]["common"], f["name"]["official"], f["name"]["common"].replace("the ", ""), civic.get(iso, {}).get("name", "")}
    names = {n.lower() for n in names if n}
    tiers = make_tiers(names)
    rows = sparql(Q_POS % cc)
    people = {}
    for r in rows:
        if not r.get("p"): continue
        qid = r["p"].rsplit("/", 1)[-1]
        label = r.get("posLabel", "")
        if not label or re.fullmatch(r"Q\d+", label) or re.fullmatch(r"Q\d+", r.get("pLabel", "")): continue
        kind, w = tier(label, tiers)
        if w <= 0: continue
        sl = int(float(r.get("sl") or 0))
        start = (r.get("start") or "")[:4]
        y = int(start) if start.isdigit() else None
        score = w + min(30, math.log1p(sl) * 6) - (12 if y is None else 0)
        cur = people.get(qid)
        if not cur or score > cur["s"]:
            people[qid] = {"n": r.get("pLabel", qid), "r": label, "k": kind, "s": round(score, 1), "w": urllib.parse.unquote((r.get("article") or "").split("/wiki/")[-1]) or None, "q": qid, "y": y, "sl": sl}
        elif cur and label not in cur["r"] and len(cur["r"]) < 90 and w >= 40:
            cur["r"] += " · " + label
    for r in sparql(Q_RICH % cc):
        if not r.get("p"): continue
        qid = r["p"].rsplit("/", 1)[-1]
        try: nw = float(r.get("nw") or 0)
        except ValueError: nw = 0
        if nw < 5e8: continue
        sl = int(float(r.get("sl") or 0))
        score = 45 + min(30, math.log10(nw / 1e8) * 10) + min(20, math.log1p(sl) * 4)
        role = f"Net worth ${nw / 1e9:.1f}B" if nw >= 1e9 else f"Net worth ${nw / 1e6:.0f}M"
        cur = people.get(qid)
        if cur:
            cur["r"] += " · " + role; cur["s"] = round(max(cur["s"], score), 1); cur["nw"] = nw
        else:
            people[qid] = {"n": r.get("pLabel", qid), "r": role, "k": "money", "s": round(score, 1), "w": urllib.parse.unquote((r.get("article") or "").split("/wiki/")[-1]) or None, "q": qid, "y": None, "sl": sl, "nw": nw}
    ranked = sorted(people.values(), key=lambda p: (-p["s"], -p["sl"]))[:100]
    # the leader for the map: who actually runs the country, and since when
    gov = civic.get(iso, {}).get("govClass", "")
    want = "government" if gov in ("Parliamentary republic", "Constitutional monarchy") else "state"
    lead = next((p for p in ranked if p["k"] == want and p["s"] >= 90), None) or next((p for p in ranked if p["k"] in ("state", "government") and p["s"] >= 90), None)
    leader = {"name": lead["n"], "role": lead["r"].split(" · ")[0], "since": lead["y"], "years": (YEAR - lead["y"]) if lead and lead["y"] else None, "w": lead["w"]} if lead else None
    json.dump({"iso": iso, "leader": leader, "people": ranked}, open(os.path.join(OUT, iso + ".json"), "w"), separators=(",", ":"), ensure_ascii=False)
    return leader, len(ranked)

todo = sys.argv[1:] or [iso for iso in civic if iso in facts]
index_path = os.path.join(OUT, "index.json")
index = json.load(open(index_path)) if os.path.exists(index_path) else {}
for i, iso in enumerate(todo):
    leader, n = bake(iso)
    index[iso] = {"n": n, **({"leader": leader["name"], "role": leader["role"], "since": leader["since"], "years": leader["years"]} if leader else {})}
    print(f"{i + 1}/{len(todo)} {iso}: {n} people; leader {leader and leader['name']} ({leader and leader['role']}, since {leader and leader['since']})", flush=True)
    json.dump({"source": "Wikidata (CC0): current office holders and declared net worth; ranking is CIV FM's", "year": YEAR, "c": index}, open(index_path, "w"), separators=(",", ":"), ensure_ascii=False)
    time.sleep(0.5)
