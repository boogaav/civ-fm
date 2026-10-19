#!/usr/bin/env python3
"""Bake the parties in each country's lower or single house, with seat shares and logos.

Seats
  1. CIA World Factbook (public domain): "parties elected and seats per party"
     for the single or lower house, present for ~115 countries.
  2. Otherwise the English Wikipedia infobox of the lower house (political_groups
     field), found through Wikidata: country → P194 legislature → P527 chambers →
     the one typed "lower house" → enwiki sitelink. CC BY-SA.
Logos, colours, abbreviations
  Wikidata parties per country (P154 logo, P465 colour, P1813 short name, aliases),
  one CSV per country from the SPARQL endpoint, matched to the seat lists by
  name. Logos are fetched as 96 px PNG thumbnails from Wikimedia Commons into
  civic/logos/<QID>.png.
Who governs
  Wikidata P6 head of government → P102 party, kept only when the person's
  name also appears in the Factbook's "head of government" line.

Usage: python3 build_parties.py <factbook dir> <wdparties dir> <hog.csv>
Output: civic/parties.json  {ISO3: {house, total, date, src, parties: [{name, short, seats, pct, qid, logo, color, leads, other}]}}
"""
import csv, glob, html, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

FB, WD, HOG = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(OUT)
UA = "civfm/0.1 (civ.fm; boogaav@gmail.com)"
facts = {f["cca3"]: f for f in json.load(open(os.path.join(ROOT, "vendor", "world-countries.json")))}
by2 = {f["cca2"]: f["cca3"] for f in facts.values()}
civic = json.load(open(os.path.join(OUT, "civic.json")))["c"]

def get(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    return urllib.request.urlopen(req, timeout=timeout).read()

TAG = re.compile(r"<[^>]+>")
def clean(t):
    return re.sub(r"\s+", " ", html.unescape(TAG.sub(" ", t or ""))).strip()

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(the|party|of|and|for|a|an|movement|alliance|union|front|list|coalition)\b", " ", s)
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())

# ---- 1. Factbook seats ----
def parse_seats(text):
    parts = []
    for seg in re.split(r";\s*", clean(text)):
        m = re.search(r"^(.*?)[\s,]*\((\d{1,4})\)\s*$", seg.strip())
        if not m: continue
        name = m.group(1).strip(" ,-")
        if not name: continue
        parts.append({"name": name, "seats": int(m.group(2))})
    return parts

seats = {}
for path in glob.glob(os.path.join(FB, "*", "*.json")):
    try: d = json.load(open(path))
    except Exception: continue
    g = d.get("Government") or {}
    name = clean((g.get("Country name") or {}).get("conventional short form", {}).get("text", ""))
    iso = next((k for k, v in civic.items() if v.get("name") == name), None)
    if not iso: continue
    L = g.get("Legislative branch") or {}
    txt = (L.get("parties elected and seats per party") or {}).get("text", "")
    parts = parse_seats(txt) if txt else []
    if len(parts) < 2: continue
    total_m = re.search(r"\d{1,4}", clean((L.get("number of seats") or {}).get("text", "")))
    total = int(total_m.group()) if total_m else 0
    date = clean((L.get("most recent election date") or {}).get("text", ""))
    seats[iso] = {"house": clean((L.get("legislature name") or {}).get("text", "")) or "Parliament", "total": max(total, sum(p["seats"] for p in parts)),
                  "date": date, "src": "factbook", "parties": parts}
print(f"factbook seats: {len(seats)} countries", flush=True)

# ---- 2. Wikipedia infobox for the rest ----
LOWER_WORDS = re.compile(r"chamber of deputies|house of commons|house of representatives|house of assembly|national assembly|legislative assembly|bundestag|sejm|lok sabha|dewan rakyat|jatiya|majlis|state duma|knesset|storting|riksdag|folketing|eduskunta|althing|d[aá]il|nationalrat|congress of deputies|chamber of representatives|legislative council|house of people|wolesi|national council|assembly", re.I)
UPPER_WORDS = re.compile(r"senate|senado|lords|council of states|bundesrat|upper|rajya sabha|federation council|house of councillors|seanad|council of the federation|house of elders|shura|national council of provinces|federal council", re.I)
def entity(qid):
    return json.loads(get(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"))["entities"][qid]
def claim_ids(ent, prop):
    return [c["mainsnak"]["datavalue"]["value"]["id"] for c in ent.get("claims", {}).get(prop, []) if c["mainsnak"].get("datavalue")]

def wiki_lower(cc, country_name):
    # country item from its English Wikipedia article, then P194 legislature(s)
    # and their chambers; the lower or single house wins by type, then by name
    try:
        r = json.loads(get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "prop": "pageprops", "titles": country_name, "format": "json", "redirects": 1})))
        page = next(iter(r["query"]["pages"].values()))
        qid = page["pageprops"]["wikibase_item"]
    except Exception:
        return []
    cands = []
    try:
        ent = entity(qid)
        for lq in claim_ids(ent, "P194"):
            le = entity(lq)
            items = [(lq, le)]
            for ch in claim_ids(le, "P527")[:8]:
                try: items.append((ch, entity(ch)))
                except Exception: pass
            bicameral = "Q189445" in set(claim_ids(le, "P31"))
            for q, e in items:
                title = (e.get("sitelinks", {}).get("enwiki") or {}).get("title")
                if not title or UPPER_WORDS.search(title): continue
                if q == lq and bicameral: continue  # the whole parliament, not a chamber
                types = set(claim_ids(e, "P31"))
                score = 3 if "Q375928" in types else 2 if LOWER_WORDS.search(title) else 1 if types & {"Q1752346", "Q11204", "Q35749"} else 0
                if score: cands.append((score, title))
    except Exception:
        pass
    # common article names, tried after what Wikidata offered
    for guess in (f"House of Commons of {country_name}", f"{country_name} House of Representatives", f"House of Representatives ({country_name})",
                  f"Chamber of Deputies ({country_name})", f"National Assembly ({country_name})", f"Chamber of Deputies of {country_name}",
                  f"National Assembly of {country_name}", f"Legislative Assembly of {country_name}", f"House of Assembly of {country_name}"):
        cands.append((0.5, guess))
    cands.sort(key=lambda x: -x[0])
    seen, out = set(), []
    for _, t in cands:
        if t not in seen: seen.add(t); out.append(t)
    return out[:3]

BLOC = re.compile(r"government|cabinet|opposition|coalition|crossbench|vacant|confidence|supply|caucus|bloc\b|majority|minority|ministry|speaker", re.I)
BOLD = "'" * 3
LINK = re.compile(r"(?:\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]|\{\{Party index link\|([^|}]+)(?:\|([^}]*))?\}\})[^\n\(\[]*?\((\d{1,4})\)")

def field(text, name):
    """The value of an infobox parameter, tracking {{ }} depth so that templates
    inside the value (efn, plainlist) do not end it early."""
    m = re.search(r"\n\s*\|\s*" + name + r"\s*=", text)
    if not m: return None
    i, depth, out = m.end(), 0, []
    HARD = re.compile(r"\s*\|\s*(term_length|voting_system\d?|structure\d|political_groups\d|last_election\d?|next_election\d?|session_room|meeting_place|website|footnotes|motto|salary|seats\d?|house\d|new_session|members|committees\d?|rules|constitution)\s*=")
    for line in text[i:].split("\n")[:160]:
        if HARD.match(line): break  # a known parameter ends the field whatever the template depth says
        if depth == 0 and (re.match(r"\s*\|\s*[a-z_0-9]+\s*=", line) or line.strip() == "}}"): break
        if line.startswith("==") : break
        out.append(line)
        depth += line.count("{{") - line.count("}}")
    return "\n".join(out)

LEGEND = re.compile(r"\{\{Party legend\|([^|}]+)\|(\d{1,4})")
COMPBAR = re.compile(r"\{\{Composition bar\|(\d{1,4})\|\d{1,4}[^}]*\}\}[^\[\n]*\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]")
def parse_groups(body):
    rows = []
    for line in body.split("\n"):
        if BOLD in line: continue
        indent = len(re.match(r"\s*([*:#]*)", line).group(1))
        found = None
        for a, b, c, d, n in LINK.findall(line):
            found = (clean(b or a or d or c), int(n), a or c); break
        if not found:
            for name, n in LEGEND.findall(line): found = (clean(name), int(n), name); break
        if not found:
            for n, a, b in COMPBAR.findall(line): found = (clean(b or a), int(n), a); break
        if not found: continue
        name = re.sub(r"\s*\(.*?\)\s*$", "", found[0])
        if name and not BLOC.search(name): rows.append((indent, name, found[1], found[2]))
    return rows

TPL_CACHE = {}
def wikitext(title):
    r = json.loads(get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "format": "json", "titles": title, "redirects": 1})))
    page = next(iter(r["query"]["pages"].values()))
    return page["revisions"][0]["slots"]["main"]["*"]

def wiki_groups(title):
    text = wikitext(title)
    body = field(text, "political_groups1") or field(text, "political_groups")
    if not body: return None, None
    # a field that is only one template, e.g. {{Composition of Australian House of Representatives}}
    one = re.fullmatch(r"\s*\{\{([^{}|]+)\}\}\s*", body or "")
    if one and "[[" not in body:
        try: body = wikitext("Template:" + one.group(1).strip())
        except Exception: pass
    # seat counts kept in a lookup template, e.g. ({{MexDep|MRN}})
    def resolve(mm):
        tpl, key = mm.group(1), mm.group(2)
        if tpl not in TPL_CACHE:
            try: TPL_CACHE[tpl] = wikitext("Template:" + tpl)
            except Exception: TPL_CACHE[tpl] = ""
        v = re.search(r"\|\s*" + re.escape(key) + r"\s*=\s*(\d{1,4})", TPL_CACHE[tpl])
        return f"({v.group(1)})" if v else mm.group(0)
    body = re.sub(r"\(\{\{(\w[\w ]*)\|(\w+)\}\}\)", resolve, body)
    rows = parse_groups(body)
    tm = re.search(r"\{\{([^{}|]*political groups)\|(\w+)\}\}", body)
    if not rows and tm:  # some parliaments keep their lists in a template with one branch per house
        t = wikitext("Template:" + tm.group(1).strip())
        start = t.find(tm.group(2) + "=")
        if start < 0: start = 0
        end = t.find("<includeonly>", start + 10)
        rows = parse_groups(t[start:end if end > 0 else None])
    if not rows: return None, None
    sm = re.search(r"\|\s*(?:seats1?|members)\s*=\s*(\d{1,4})", text)
    total = int(sm.group(1)) if sm else 0
    # several indent levels can appear (blocs, sub-parties): keep the level
    # whose seats add up closest to the house size, else the outermost
    levels = sorted({i for i, *_ in rows})
    sums = {L: sum(n for i, _, n, _ in rows if i == L) for L in levels}
    best = max(levels, key=lambda L: sums[L])  # a stray unindented note must not win
    # the seats field is trusted only when it is in the same range as the
    # main level; then a level that overshoots it is double counting
    plausible = total and total >= sums[best] * 0.5
    if plausible and sums[best] > total * 1.05:
        best = min(levels, key=lambda L: abs(sums[L] - total))
    if not plausible: total = 0
    lvl = [r for r in rows if r[0] == best]
    # federations listed at the same indent as their members (Brazil): a row
    # whose seats equal the sum of the next two to four rows is a header
    if total and sum(r[2] for r in lvl) > total * 1.05:
        drop = set()
        for i in range(len(lvl)):
            for k in range(2, 5):
                if i + k < len(lvl) + 1 and lvl[i][2] == sum(r[2] for r in lvl[i + 1:i + 1 + k]) and lvl[i][2] > 0:
                    drop.add(i); break
        lvl = [r for i, r in enumerate(lvl) if i not in drop]
    parts, seen = [], set()
    for indent, name, n, link in lvl:
        if name.lower() in seen: continue
        seen.add(name.lower()); parts.append({"name": name, "seats": n, "wiki": link})
    return parts, total

todo = [(iso, v) for iso, v in civic.items() if iso not in seats and v.get("gov") and iso in facts]
print(f"trying wikipedia for {len(todo)} countries", flush=True)
for iso, v in todo:
    name = facts[iso]["name"]["common"]
    for title in wiki_lower(facts[iso]["cca2"], name):
        try: parts, total = wiki_groups(title)
        except Exception: parts = None
        if parts and len(parts) >= 2:
            seats[iso] = {"house": re.sub(r"\s*\(.*?\)\s*$", "", title), "total": max(total, sum(p["seats"] for p in parts)), "date": "", "src": "wikipedia", "parties": parts}
            break
    time.sleep(0.2)
print(f"seats after wikipedia: {len(seats)} countries", flush=True)

# ---- 3. Wikidata parties: logos, colours, aliases ----
wd = {}
for path in glob.glob(os.path.join(WD, "*.csv")):
    iso = os.path.basename(path)[:-4]
    rows = []
    try:
        for r in csv.DictReader(open(path, encoding="utf-8")):
            if not r.get("p"): continue
            rows.append({"qid": r["p"].rsplit("/", 1)[-1], "label": r.get("pLabel", ""), "logo": r.get("logo", ""), "color": (r.get("color") or "").strip(),
                         "short": r.get("short", ""), "alts": [a for a in (r.get("alts") or "").split("|") if a]})
    except Exception: pass
    # one row per qid (seat rows duplicate parties)
    byq = {}
    for r in rows:
        q = byq.setdefault(r["qid"], r)
        if not q["logo"] and r["logo"]: q["logo"] = r["logo"]
    wd[iso] = list(byq.values())

def match(iso, name):
    cands = wd.get(iso, [])
    n = norm(name)
    if not n: return None
    exact = [r for r in cands if n in {norm(r["label"]), norm(r["short"]), *(norm(a) for a in r["alts"])}]
    if exact: return sorted(exact, key=lambda r: (not r["logo"], not r["color"]))[0]
    # abbreviation inside the name, e.g. "Justice and Development Party (Ak Party)"
    for ab in re.findall(r"\(([A-Za-z\-\.]{2,12})\)", name):
        for r in cands:
            if r["short"].lower() == ab.lower() or ab.lower() in (a.lower() for a in r["alts"]): return r
    # token overlap
    toks = set(n.split())
    best, score = None, 0
    for r in cands:
        for k in {norm(r["label"]), *(norm(a) for a in r["alts"])}:
            kt = set(k.split())
            if not kt: continue
            s = len(toks & kt) / len(toks | kt)
            if s > score: best, score = r, s
    return best if score >= 0.6 else None

# ---- 4. who leads the government ----
hog = {}
for r in csv.DictReader(open(HOG, encoding="utf-8")):
    hog.setdefault(r["cc"], []).append((r.get("hogLabel", ""), (r.get("party") or "").rsplit("/", 1)[-1], r.get("partyLabel", "")))

# ---- assemble ----
out, logo_jobs = {}, {}
OTHER = re.compile(r"^(other|others|independent|independents|vacant|non-?partisan|unaffiliated)", re.I)
for iso, rec in seats.items():
    parties = []
    cc = facts[iso]["cca2"]
    head = (civic[iso].get("head") or "").lower()
    lead_q, lead_name = None, None
    rows_h = hog.get(cc, [])
    for person, pq, plabel in rows_h:
        if person and person.split()[-1].lower() in head and pq: lead_q, lead_name = pq, plabel; break
    if not lead_q and len([r for r in rows_h if r[1]]) == 1:
        lead_q, lead_name = next((pq, pl) for _, pq, pl in rows_h if pq)
    for p in rec["parties"]:
        other = bool(OTHER.match(p["name"]))
        m = None if other else match(iso, p["name"])
        qid = m["qid"] if m else None
        if m and m["logo"]: logo_jobs[qid] = m["logo"]
        leads = bool(lead_q and qid == lead_q) or bool(lead_name and norm(lead_name) and norm(lead_name) == norm(p["name"]))
        if not leads and lead_name:
            # "CDU/CSU" leads when the head of government's party is the CDU
            lead_row = next((r for r in wd.get(iso, []) if r["qid"] == lead_q), None)
            abbrs = {a.lower() for a in ([lead_row["short"]] + lead_row["alts"] if lead_row else []) if 1 < len(a) <= 8}
            parts_of_name = {t.lower() for t in re.split(r"[\s/\-–]+", p["name"]) if t}
            if abbrs & parts_of_name: leads = True
        parties.append({"name": p["name"], "short": (m or {}).get("short") or "", "seats": p["seats"], "pct": round(100 * p["seats"] / rec["total"], 1) if rec["total"] else None,
                        "qid": qid, "logo": bool(qid and m["logo"]), "color": (m or {}).get("color") or "", "leads": leads, "other": other})
    parties.sort(key=lambda p: -p["seats"])
    out[iso] = {"house": rec["house"], "total": rec["total"], "date": rec["date"], "src": rec["src"], "parties": parties,
                "leader": civic[iso].get("head") or ""}

# ---- 5. logos ----
os.makedirs(os.path.join(OUT, "logos"), exist_ok=True)
def fetch_logo(item):
    qid, url = item
    dest = os.path.join(OUT, "logos", f"{qid}.png")
    if os.path.exists(dest) and os.path.getsize(dest) > 200: return True
    fname = url.rsplit("/", 1)[-1]
    thumb = f"https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/{fname}&width=96"
    for t in range(3):
        try:
            b = get(thumb, timeout=60)
            if len(b) > 200:
                open(dest, "wb").write(b); return True
        except Exception:
            time.sleep(1.5)
    return False
with ThreadPoolExecutor(6) as ex:
    got = sum(1 for ok in ex.map(fetch_logo, logo_jobs.items()) if ok)
print(f"logos: {got} of {len(logo_jobs)} fetched", flush=True)
for iso, rec in out.items():
    for p in rec["parties"]:
        if p["logo"] and not os.path.exists(os.path.join(OUT, "logos", f"{p['qid']}.png")): p["logo"] = False

json.dump({"sources": {"seats": "CIA World Factbook (public domain) or English Wikipedia lower-house infobox (CC BY-SA)",
                       "parties": "Wikidata (CC0); logos from Wikimedia Commons, each under its own licence"},
           "c": out}, open(os.path.join(OUT, "parties.json"), "w"), separators=(",", ":"), ensure_ascii=False)
n_parties = sum(len(r["parties"]) for r in out.values())
n_logo = sum(1 for r in out.values() for p in r["parties"] if p["logo"])
n_lead = sum(1 for r in out.values() if any(p["leads"] for p in r["parties"]))
print(f"{len(out)} countries, {n_parties} party rows, {n_logo} with logos, {n_lead} with a governing party marked; parties.json {os.path.getsize(os.path.join(OUT, 'parties.json')) // 1024} KB")
