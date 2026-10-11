#!/usr/bin/env python3
"""Bake measured internet speed per region from Ookla Open Data.

Ookla publishes Speedtest results aggregated to ~600 m web-mercator tiles,
quarterly, under CC BY-NC-SA 4.0 (civ.fm is non-commercial):
  s3://ookla-open-data/parquet/performance/type={fixed,mobile}/year=YYYY/quarter=Q/*.parquet
Each row: quadkey, avg_d_kbps, avg_u_kbps, avg_lat_ms, tests, devices.

This script drops every tile centre into the Place regions (regions.json,
built by build_place.py) and writes internet.json:
  {"quarter": "2026-Q3", "r": {GDL code: [fixed Mbps, mobile Mbps, tests]}}
where each speed is the tests-weighted mean download speed, null if the
region has fewer than 20 tests of that kind.

Needs pyarrow, shapely, numpy (a venv is fine). Download the two parquet
files first (they are 350 MB and 190 MB; on a throttled link, parallel
range requests help, see proxy of this in the session notes).

Usage: python3 build_internet.py <fixed.parquet> <mobile.parquet> <quarter label>
"""
import json, math, os, sys
import numpy as np
import pyarrow.parquet as pq
from shapely.geometry import Polygon, MultiPolygon, Point
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
fixed_path, mobile_path, quarter = sys.argv[1], sys.argv[2], sys.argv[3]

# ---- regions from TopoJSON ----
topo = json.load(open(os.path.join(HERE, "regions.json")))
sx, sy = topo["transform"]["scale"]
tx, ty = topo["transform"]["translate"]

def arc(i):
    a = topo["arcs"][i if i >= 0 else ~i]
    pts, x, y = [], 0, 0
    for dx, dy in a:
        x += dx; y += dy
        pts.append((x * sx + tx, y * sy + ty))
    return pts if i >= 0 else pts[::-1]

def ring(arcs):
    pts = []
    for i in arcs:
        seg = arc(i)
        pts.extend(seg if not pts else seg[1:])
    return pts

def shape(g):
    if g["type"] == "Polygon":
        rings = [ring(r) for r in g["arcs"]]
        return Polygon(rings[0], rings[1:]) if len(rings[0]) >= 4 else None
    polys = []
    for p in g["arcs"]:
        rings = [ring(r) for r in p]
        if len(rings[0]) >= 4:
            polys.append(Polygon(rings[0], rings[1:]))
    return MultiPolygon(polys) if polys else None

codes, shapes = [], []
for g in topo["objects"]["regions"]["geometries"]:
    s = shape(g)
    if s is None or s.is_empty:
        continue
    if not s.is_valid:
        s = s.buffer(0)
    codes.append(g["properties"]["g"])
    shapes.append(s)
tree = STRtree(shapes)
print(f"{len(shapes)} region shapes", flush=True)

# ---- quadkey → tile centre (lon, lat) ----
def centres(quadkeys):
    n = len(quadkeys)
    lon = np.empty(n); lat = np.empty(n)
    for k, q in enumerate(quadkeys):
        z = len(q); x = y = 0
        for ch in q:
            x <<= 1; y <<= 1
            c = ord(ch) - 48
            x |= c & 1; y |= c >> 1
        cx, cy = (x + 0.5) / (1 << z), (y + 0.5) / (1 << z)
        lon[k] = cx * 360 - 180
        lat[k] = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * cy))))
    return lon, lat

def aggregate(path):
    sums = np.zeros(len(shapes)); tests = np.zeros(len(shapes))
    pf = pq.ParquetFile(path)
    done = 0
    for batch in pf.iter_batches(batch_size=500_000, columns=["quadkey", "avg_d_kbps", "tests"]):
        q = batch.column("quadkey").to_pylist()
        d = batch.column("avg_d_kbps").to_numpy(zero_copy_only=False).astype(float)
        t = batch.column("tests").to_numpy(zero_copy_only=False).astype(float)
        lon, lat = centres(q)
        pts = [Point(x, y) for x, y in zip(lon, lat)]
        idx_pts, idx_reg = tree.query(pts, predicate="within")
        np.add.at(sums, idx_reg, d[idx_pts] * t[idx_pts])
        np.add.at(tests, idx_reg, t[idx_pts])
        done += len(q)
        print(f"  {os.path.basename(path)}: {done:,} tiles", flush=True)
    return sums, tests

fs, ft = aggregate(fixed_path)
ms, mt = aggregate(mobile_path)

out = {}
for i, code in enumerate(codes):
    f = round(fs[i] / ft[i] / 1000, 1) if ft[i] >= 20 else None
    m = round(ms[i] / mt[i] / 1000, 1) if mt[i] >= 20 else None
    if f is None and m is None:
        continue
    out[code] = [f, m, int(ft[i] + mt[i])]
json.dump({"source": "Ookla Open Data, Speedtest tiles, CC BY-NC-SA 4.0", "quarter": quarter, "r": out},
          open(os.path.join(HERE, "internet.json"), "w"), separators=(",", ":"))
print(f"{len(out)} regions with speed; internet.json {os.path.getsize(os.path.join(HERE, 'internet.json')) // 1024} KB")
