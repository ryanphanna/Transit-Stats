"""
gtfs-import-prep.py
Reads TTC GTFS and outputs gtfs-import-data.json — a list of stops to import,
limited to routes the user has actually ridden. Run before gtfs-import.js.

Usage:
  python3 Tools/gtfs-import-prep.py
"""

import csv, json, re
from collections import defaultdict

GTFS_DIR = "/Users/ryan/Desktop/Mag/Tools/Transit/Reroute/data/gtfs/"
OUT_FILE  = "Tools/gtfs-import-data.json"

# Base route numbers extracted from trip history
USER_BASE_ROUTES = {
  '1','2','4','5','6','7','10','12','14','18','22','23','24','29','30','33',
  '35','40','41','43','45','47','52','54','56','63','65','66','67','72','81',
  '83','84','89','94','96','100','101','105','107','114','127','128','134',
  '161','180','184','204','234','292','344','500','501','503','504','505',
  '506','509','510','511','512','523','754','761','800','815','900','901',
  '906','927','929',
}

def base(route_short_name):
    m = re.match(r'^(\d+)', route_short_name.replace(' ', ''))
    return m.group(1) if m else None

print("Loading routes...")
route_ids = {}  # route_id -> short_name
with open(GTFS_DIR + "routes.txt") as f:
    for row in csv.DictReader(f):
        b = base(row.get('route_short_name', ''))
        if b and b in USER_BASE_ROUTES:
            route_ids[row['route_id']] = row['route_short_name']

print(f"  {len(route_ids)} matching route IDs")

print("Loading trips...")
trip_to_route = {}
with open(GTFS_DIR + "trips.txt") as f:
    for row in csv.DictReader(f):
        if row['route_id'] in route_ids:
            trip_to_route[row['trip_id']] = route_ids[row['route_id']]

print(f"  {len(trip_to_route)} trips")

print("Scanning stop_times (this takes ~10s)...")
stop_routes = defaultdict(set)
with open(GTFS_DIR + "stop_times.txt") as f:
    reader = csv.DictReader(f)
    for row in reader:
        tid = row['trip_id']
        if tid in trip_to_route:
            stop_routes[row['stop_id']].add(trip_to_route[tid])

print(f"  {len(stop_routes)} stops across matched routes")

print("Loading stop details...")
stops_out = []
with open(GTFS_DIR + "stops.txt") as f:
    for row in csv.DictReader(f):
        sid = row['stop_id']
        if sid not in stop_routes:
            continue
        code = row['stop_code']
        name = row['stop_name']
        lat  = float(row['stop_lat'])
        lng  = float(row['stop_lon'])
        routes = sorted(stop_routes[sid])
        stops_out.append({
            'code': code,
            'name': name,
            'lat': lat,
            'lng': lng,
            'routes': routes,
        })

print(f"  {len(stops_out)} stops ready")

with open(OUT_FILE, 'w') as f:
    json.dump(stops_out, f)

print(f"Written to {OUT_FILE}")
