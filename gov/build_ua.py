#!/usr/bin/env python3
"""Bake Ukraine's government and money map: gov/ua.json.

Money: Ministry of Finance of Ukraine, Open Budget portal (openbudget.gov.ua),
  the same API the portal's own pages call. State budget 2025 (full year) by
  spending body and program, by function and by revenue source; state budget
  2026 so far; every region's consolidated local budgets; the budgets of Kyiv,
  the regional capitals and the 24 regional councils (2025, full year).
  The portal answers from inside Ukraine and from Cloudflare's network, but not
  from every country: pass --base with a relay prefix if a direct call times out.
Cabinet: Wikipedia, "Koretskyi Government" (CC BY-SA), as of the date below.

Usage: python3 build_ua.py [--base "http://localhost:8799/?u="]
"""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ORIGIN = "https://openbudget.gov.ua"
BASE = sys.argv[sys.argv.index("--base") + 1] if "--base" in sys.argv else ""

def get(path):
    url = ORIGIN + path
    if BASE:  # relay: {status, body} wrapper around the real response
        url = BASE + urllib.parse.quote(url, safe="")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "civfm-build/1.0 (+https://civ.fm)"}), timeout=90) as r:
                d = json.load(r)
            if BASE:
                if d.get("status") != 200: raise RuntimeError(f"{path}: {d.get('status')}")
                d = json.loads(d["body"])
            return d
        except Exception as e:
            if attempt == 2: raise
            time.sleep(3)

bn = lambda v: round((v or 0) / 1e9, 2)  # UAH → billions

# ---------- national: who spends, on what, from where ----------
Y = "year=2025&monthFrom=1&monthTo=12&budgetType=NATIONAL&fundType=TOTAL"
prog = get("/api/reports/expenses/program?" + Y)["items"]
func = get("/api/reports/expenses/functional?" + Y)["items"]
inc = get("/api/reports/income/details?" + Y)["items"]
prog26 = get("/api/reports/expenses/program?year=2026&monthFrom=1&monthTo=9&budgetType=NATIONAL&fundType=TOTAL")["items"]

def leaves(n):
    kids = n.get("children") or []
    return [x for k in kids for x in leaves(k)] if kids else [n]

def unit(n):
    d = n["data"]
    plan = d.get("planCorrectionBeginYear") or d.get("planBeginYear")
    progs = sorted(leaves(n), key=lambda x: -(x["data"].get("donePeriod") or 0))[:6]
    return {"code": n["code"], "name": n["codeName"].strip(), "spent": bn(d.get("donePeriod")), "plan": bn(plan),
            "programs": [{"code": p["code"], "name": p["codeName"].strip(), "spent": bn(p["data"].get("donePeriod")),
                          "plan": bn(p["data"].get("planCorrectionBeginYear") or p["data"].get("planBeginYear"))} for p in progs if p is not n]}

total = next(x for x in prog if x["code"] == "0000")
units = [unit(x) for x in prog if x["level"] == 1 and x["code"] != "0000"]
units26 = {x["code"]: {"spent": bn(x["data"].get("donePeriod")), "plan": bn(x["data"].get("planCorrectionBeginYear") or x["data"].get("planBeginYear"))}
           for x in prog26 if x["level"] == 1}
FUNC_EN = {"0100": "General public services", "0200": "Defence", "0300": "Public order, safety and courts", "0400": "Economic affairs",
           "0500": "Environment", "0600": "Housing and utilities", "0700": "Health", "0800": "Culture, sport and youth", "0900": "Education",
           "1000": "Social protection", "0180": "Transfers to local budgets"}
INC_EN = {"40000000": "Transfers from the state budget", "10000000": "Taxes", "20000000": "Non-tax revenue", "30000000": "Capital revenue", "41000000": "From other public bodies",
          "42000000": "Grants from the EU, foreign governments and international organisations", "50000000": "Trust funds"}
TAX_EN = {"11000000": "Income and profit taxes", "13000000": "Rent for natural resources", "14000000": "VAT and excise (taxes on goods and services)", "15000000": "Customs and foreign trade taxes", "17000000": "Fuel and energy levies", "18000000": "Local taxes and fees", "19000000": "Other taxes and fees", "21000000": "Income from state property and enterprises", "22000000": "Administrative fees and charges", "24000000": "Other non-tax revenue", "25000000": "Own revenue of public institutions", "31000000": "Sale of fixed capital", "32000000": "Sale of state reserves", "33000000": "Sale of land and intangible assets", "41010000": "From other budgets", "42010000": "UN, NATO, EU and OSCE payments for peacekeeping", "42020000": "Grants and gifts", "42030000": "EU, foreign government and donor assistance programmes", "50070000": "Fund for social protection of people with disabilities"}  # second level of revenue, every category

revenue = []
for x in inc:
    if x["level"] != 1 or x["code"] == "0000000": continue
    kids = [{"name": TAX_EN.get(k["code"], k["codeName"].strip()), "uk": k["codeName"].strip(), "value": bn(k["data"].get("donePeriod"))}
            for k in x.get("children") or []]
    revenue.append({"code": x["code"], "name": INC_EN.get(x["code"], x["codeName"].strip()), "uk": x["codeName"].strip(),
                    "value": bn(x["data"].get("donePeriod")), "parts": sorted(kids, key=lambda k: -k["value"])})
inc_total = bn(next(x for x in inc if x["code"] == "0000000")["data"]["donePeriod"])
functions = [{"code": x["code"], "name": FUNC_EN.get(x["code"], x["codeName"]), "uk": x["codeName"].strip(), "value": bn(x["data"].get("donePeriod"))}
             for x in func if x["level"] == 1 and x["code"] != "00"]

# ---------- regions and cities ----------
terr = get("/api/localBudgets/territories")  # thousand UAH, current year to date
regions = [{"id": t["id"], "name": t["territoryName"], "revenue": round((t["incomeAmountFakt"] or 0) / 1e6, 2),
            "spending": round((t["expensesCreditAmountFakt"] or 0) / 1e6, 2)} for t in terr if t["incomeAmountFakt"]]

LOCAL = [  # budget code, English name, kind
    ("2600000000", "Kyiv", "capital"), ("1356300000", "Lviv", "city"), ("2055400000", "Kharkiv", "city"), ("1556400000", "Odesa", "city"),
    ("0457600000", "Dnipro", "city"), ("0856200000", "Zaporizhzhia", "city"), ("0253600000", "Vinnytsia", "city"), ("0355100000", "Lutsk", "city"),
    ("0655200000", "Zhytomyr", "city"), ("0755900000", "Uzhhorod", "city"), ("0953300000", "Ivano-Frankivsk", "city"),
    ("1152810000", "Kropyvnytskyi", "city"), ("1454900000", "Mykolaiv", "city"), ("1657010000", "Poltava", "city"), ("1756400000", "Rivne", "city"),
    ("1853100000", "Sumy", "city"), ("1954900000", "Ternopil", "city"), ("2155300000", "Kherson", "city"), ("2256400000", "Khmelnytskyi", "city"),
    ("2357600000", "Cherkasy", "city"), ("2455200000", "Chernivtsi", "city"), ("2555900000", "Chernihiv", "city"), ("0552400000", "Kramatorsk", "city"),
]
OBLASTS = ["Vinnytsia", "Volyn", "Dnipropetrovsk", "Donetsk", "Zhytomyr", "Zakarpattia", "Zaporizhzhia", "Ivano-Frankivsk", "Kyiv", "Kirovohrad",
           "Luhansk", "Lviv", "Mykolaiv", "Odesa", "Poltava", "Rivne", "Sumy", "Ternopil", "Kharkiv", "Kherson", "Khmelnytskyi", "Cherkasy",
           "Chernivtsi", "Chernihiv"]
LOCAL += [(f"{i:02d}10000000", f"{n} region", "oblast") for i, n in zip(range(2, 26), OBLASTS)]

L = "codeBudget={}&fundType=TOTAL&year=2025&periodType=MONTH&periodFrom=01&periodTo=12"
locals_ = []
for code, name, kind in LOCAL:
    q = L.format(code)
    try:
        li, lf, lp = (get(f"/api/localBudgets/{ep}?" + q)["items"] for ep in ("incomesLocal", "functional", "program"))
    except Exception as e:
        print("skip", name, e); continue
    tot = lambda items, k: next((x for x in items if x["level"] == 1 and x["code"] in ("0000000", "00", "0000")), {"data": {}})["data"].get(k)
    locals_.append({
        "code": code, "name": name, "kind": kind,
        "revenue": bn(tot(li, "donePeriod")), "spending": bn(tot(lf, "donePeriod")),
        "revenueParts": sorted([{"name": INC_EN.get(x["code"], x["codeName"].strip()), "uk": x["codeName"].strip(), "value": bn(x["data"].get("donePeriod"))}
                                for x in li if x["level"] == 1 and x["code"] != "0000000"], key=lambda x: -x["value"]),
        "functions": sorted([{"name": FUNC_EN.get(x["code"][:4], x["codeName"].strip()), "uk": x["codeName"].strip(), "value": bn(x["data"].get("donePeriod"))}
                             for x in lf if x["level"] == 1 and x["code"] != "00"], key=lambda x: -x["value"]),
        # first level of the local program classification = the council's departments
        "departments": sorted([{"name": x["codeName"].strip(), "value": bn(x["data"].get("donePeriod")),
                                "plan": bn(x["data"].get("koshtorysZmin") or x["data"].get("rozpisZmin"))}
                               for x in lp if x["level"] == 1 and x["code"] != "0000"], key=lambda x: -x["value"])[:12],
    })
    print(name, locals_[-1]["revenue"], locals_[-1]["spending"])

# ---------- cabinet (Wikipedia, Koretskyi Government) ----------
# codes: the ministry's spending-unit codes in the state budget; its "general
# state expenditures" line (code +10000) is money it passes on, e.g. subventions
CABINET = [
    ("Prime Minister", "Serhii Koretskyi", "2026-07-16", "Independent", ["0410000"], "Leads the Cabinet of Ministers and sets government policy; the Cabinet Secretariat runs its machinery."),
    ("First Deputy PM, Minister of Energy", "Denys Shmyhal", "2026-01-14", "Independent", ["2400000", "2410000"], "Keeps power, gas and heat flowing; repairs the energy grid after attacks; energy security and reform."),
    ("Deputy PM for European and Euro-Atlantic Integration", "Vsevolod Chentsov", "2026-07-16", "Independent", [], "Coordinates EU accession talks and NATO integration across ministries. No budget line of its own."),
    ("Deputy PM for Humanitarian Policy, Minister of Culture", "Tetyana Berezhna", "2026-07-16", "Independent", ["3800000", "3810000"], "Culture, heritage, national memory and the humanitarian agenda."),
    ("Minister of Internal Affairs", "Ivan Vyhivskyi", "2026-07-16", "Independent", ["1000000"], "National Police, National Guard, State Emergency Service and Border Guard."),
    ("Minister of Foreign Affairs", "Andrii Sybiha", "2024-09-05", "Independent", ["1400000"], "Diplomacy, embassies and consular help for Ukrainians abroad."),
    ("Minister of Defence", "Yevhenii Khmara", "2026-07-16", "Independent", ["2100000"], "The Armed Forces: pay, weapons, equipment and procurement."),
    ("Minister of Youth and Sports", "Matvii Bidnyi", "2026-07-17", "Independent", ["3400000", "3410000"], "Youth policy, sport and physical activity."),
    ("Minister of Health", "Viktor Liashko", "2026-07-17", "Independent", ["2300000", "2310000"], "Public health and the medical guarantee programme that pays hospitals and doctors."),
    ("Minister of Finance", "Serhiy Marchenko", "2026-07-17", "Independent", ["3500000", "3510000"], "Writes and runs the budget, taxes, debt and customs. Its general line includes debt interest and reserves."),
    ("Minister of Justice", "Denys Maslov", "2026-07-16", "Servant of the People", ["3600000"], "Courts' support, prisons, registries and legal aid."),
    ("Minister of Social Policy, Family and Unity", "Denys Uliutin", "2026-07-17", "Independent", ["2500000", "2510000"], "Pensions top-ups, social assistance, families, people with disabilities, displaced people's payments."),
    ("Minister of Agrarian Policy and Food", "Taras Vysotskyi", "2026-07-16", "Independent", [], "Farming, food security and land. Re-created in July 2026: its money still sits inside the Ministry of Economy line."),
    ("Minister of Veterans' Affairs", "Vitalii Kim", "2026-07-16", "Independent", ["1500000", "1510000"], "Support, rehabilitation and benefits for veterans and their families."),
    ("Minister of Reconstruction, Infrastructure and Transport", "Mykola Kalashnyk", "2026-07-16", "Independent", ["3100000", "3120000"], "Roads, bridges, railways, ports and rebuilding after the war. Inherits the former Communities and Territories line."),
    ("Minister of Communities, Territories and Internally Displaced Persons", "Vitalii Bezghin", "2026-07-16", "Servant of the People", [], "Local self-government, regional policy and displaced people. Split off in July 2026; shares its predecessor's budget line."),
    ("Minister of Digital Transformation", "Oksana Ferchuk", "2026-07-16", "Independent", ["2900000"], "Diia, e-services, digital economy and cyber."),
    ("Minister of Education and Science", "Andriy Butenko", "2026-07-16", "Independent", ["2200000", "2210000"], "Schools, universities and science. Its general line funds teachers' pay through subventions."),
    ("Minister of Economy and Environmental Protection", "Oleksandr Kravchenko", "2026-07-16", "Independent", ["1200000", "1210000"], "Economy, trade, jobs, environment and natural resources."),
]
by = {u["code"]: u for u in units}
cabinet = []
for office, person, since, party, codes, does in CABINET:
    us = [by[c] for c in codes if c in by]
    cabinet.append({"office": office, "person": person, "since": since, "party": party, "does": does,
                    "spent2025": round(sum(u["spent"] for u in us), 2), "plan2025": round(sum(u["plan"] for u in us), 2),
                    "spent2026": round(sum(units26.get(c, {}).get("spent", 0) for c in codes), 2),
                    "plan2026": round(sum(units26.get(c, {}).get("plan", 0) for c in codes), 2),
                    "programs": sorted([p for u in us for p in u["programs"]], key=lambda p: -p["spent"])[:6]})

out = {
    "updated": time.strftime("%Y-%m-%d"),
    "national": {"year": 2025, "spending": bn(total["data"]["donePeriod"]), "plan": bn(total["data"].get("planCorrectionBeginYear")),
                 "revenue": inc_total, "revenueParts": revenue, "functions": functions,
                 "units": sorted(units, key=lambda u: -u["spent"])},
    "y2026": {"months": 9, "spending": units26.get("0000", {}).get("spent"), "plan": units26.get("0000", {}).get("plan")},
    "cabinet": cabinet, "regions": regions, "locals": locals_,
}
assert out["national"]["spending"] > 4000 and any(c["person"] == "Serhii Koretskyi" for c in cabinet) and any(l["name"] == "Kyiv" for l in locals_), "sanity"
json.dump(out, open(os.path.join(HERE, "ua.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print("gov/ua.json:", len(units), "spending units,", len(locals_), "local budgets")
