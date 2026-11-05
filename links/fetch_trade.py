"""Pull every reporter's goods exports and imports by partner from the UN Comtrade
public preview API (no key). Caches each response so a rerun resumes.
usage: python3 -I fetch_trade.py <workdir>"""
import json, os, sys, time, urllib.request, urllib.error

W = sys.argv[1]
CACHE = os.path.join(W, "trade_raw"); os.makedirs(CACHE, exist_ok=True)
rep = [r for r in json.load(open(os.path.join(W, "reporters.json")))["results"]
       if not r["isGroup"] and len(r.get("reporterCodeIsoAlpha3") or "") == 3 and not r["reporterCodeIsoAlpha3"].startswith("_")
       and not (r.get("entryExpiredDate") or "")]
print(len(rep), "reporters", flush=True)

def get(code, flow, year):
    url = (f"https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode={code}&period={year}"
           f"&flowCode={flow}&cmdCode=TOTAL&partner2Code=0&customsCode=C00&motCode=0")
    tries = 0
    while tries < 5:
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 403 and "Quota" in str(e.reason):
                # the free preview has a rolling quota: wait it out, then carry on
                print("quota reached, sleeping 30 min", flush=True); time.sleep(1800); continue
            if e.code not in (429, 500, 502, 503, 504): raise
        except Exception:
            pass
        tries += 1
        time.sleep((2, 10, 30, 60, 120)[tries - 1])
    return None

for r in rep:
    for flow in ("X", "M"):
        out = os.path.join(CACHE, f"{r['reporterCodeIsoAlpha3']}_{flow}.json")
        if os.path.exists(out): continue
        got = None
        for year in (2023, 2024, 2022, 2021):  # 2023 first: most countries have it, so one call usually does
            d = get(r["reporterCode"], flow, year)
            time.sleep(1.2)
            if d and d.get("data"):
                got = {"year": year, "data": [{"p": x["partnerCode"], "v": x["primaryValue"]} for x in d["data"]]}
                break
        json.dump(got or {"year": None, "data": []}, open(out, "w"))
        print(r["reporterCodeIsoAlpha3"], flow, got and got["year"], flush=True)
print("done", flush=True)
