#!/usr/bin/env python3
"""Bake the GDACS flood archive into relief/floods.json.

Past years never change, so the relief page reads them from this static file
and only asks the proxy Worker for the current year. Re-run occasionally
(yearly is enough) to fold the latest events into the static copy:

    python3 relief/build_floods.py

Output: {"baked": "YYYY-MM-DD", "since": 2020, "floods": [[lon, lat, "YYYY-MM-DD", level, country], ...]}
level: 0 Green, 1 Orange, 2 Red. Counting starts in 2020 because GDACS logged
only ~100 floods a year before 2019 against ~600 since 2021.
"""
import datetime, json, os, sys, time, urllib.request

SINCE = 2020
BASE = ("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=FL"
        "&alertlevel=Green;Orange;Red&fromDate={y}-01-01&toDate={y}-12-31&pagenumber={p}")
LEVEL = {"Green": 0, "Orange": 1, "Red": 2}


def page(year, n):
    req = urllib.request.Request(BASE.format(y=year, p=n), headers={
        "User-Agent": "civfm/0.1 (civ.fm; boogaav@gmail.com)", "Accept": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                if r.status == 204:
                    return []
                return json.load(r).get("features", [])
        except Exception as e:  # one page at a time, politely, with retries
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))


def main():
    today = datetime.datetime.now(datetime.timezone.utc).date()
    seen, floods = set(), []
    for year in range(SINCE, today.year + 1):
        n, count = 1, 0
        while True:
            feats = page(year, n)
            for f in feats:
                p, c = f.get("properties", {}), (f.get("geometry") or {}).get("coordinates")
                if not c or p.get("eventid") in seen:
                    continue
                seen.add(p.get("eventid"))
                floods.append([round(c[0], 2), round(c[1], 2), str(p.get("fromdate", ""))[:10],
                               LEVEL.get(p.get("alertlevel"), 0), p.get("country") or ""])
                count += 1
            if len(feats) < 100:
                break
            n += 1
            time.sleep(0.4)
        print(f"{year}: {count} floods ({n} pages)", file=sys.stderr)
    floods.sort(key=lambda f: f[2])
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "floods.json")
    with open(out, "w") as fh:
        json.dump({"baked": today.isoformat(), "since": SINCE, "floods": floods}, fh, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {out}: {len(floods)} floods, {os.path.getsize(out) // 1024} KB", file=sys.stderr)


if __name__ == "__main__":
    main()
