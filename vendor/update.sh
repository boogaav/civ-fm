#!/bin/sh
# Refresh the vendored datasets. Needs the GitHub CLI (gh), curl, tar, python3.
set -e
cd "$(dirname "$0")"
gh api repos/johan/world.geo.json/contents/countries.geo.json -H "Accept: application/vnd.github.raw" > countries.geo.json
gh api repos/ilyankou/passport-index-dataset/contents/passport-index-tidy-iso3.csv -H "Accept: application/vnd.github.raw" > passport-index-tidy-iso3.csv
tmp=$(mktemp -d)
curl -sL "https://registry.npmjs.org/world-countries/-/world-countries-5.1.0.tgz" | tar -xz -C "$tmp" package/countries.json
python3 - "$tmp/package/countries.json" <<'PY'
import json, sys
keep = ["cca2","cca3","ccn3","name","capital","region","subregion","languages","currencies","latlng","area","borders","flag","independent","unMember","landlocked"]
out = []
for r in json.load(open(sys.argv[1])):
    o = {k: r[k] for k in keep if k in r}
    o["name"] = {"common": r["name"]["common"], "official": r["name"]["official"]}
    out.append(o)
json.dump(out, open("world-countries.json", "w"), separators=(",", ":"), ensure_ascii=False)
PY
rm -rf "$tmp"
ls -la
