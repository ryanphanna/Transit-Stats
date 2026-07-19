"""
One-off analysis: Show the real-world (start_stop + previous route) buckets
that actually have repeated observations (count >= 2).

This is the single chosen next step after the v2 transfer baseline experiment.
"""

import pandas as pd
from datetime import timedelta
import os
import re
import firebase_admin
from firebase_admin import credentials, firestore

CSV_PATH = "ml/trips.csv"
KEY_PATH = os.path.expanduser("~/Desktop/Dev/Credentials/Firebase for Transit Stats.json")
_stops_lib = None

def load_stops_library():
    global _stops_lib
    if _stops_lib is not None:
        return _stops_lib
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    docs = db.collection("stops").stream()
    lib = []
    for doc in docs:
        d = doc.to_dict()
        lib.append({"name": d.get("name"), "aliases": d.get("aliases", [])})
    _stops_lib = lib
    return lib

def canonicalize_stop(name, lib):
    if not name:
        return "unknown"
    lower = str(name).strip().lower().replace(" and ", "/").replace(" & ", "/").replace(" @ ", "/").replace(" at ", "/")
    lower = re.sub(r"\s*/\s*", "/", lower)

    for item in lib:
        candidates = [item["name"]] + item.get("aliases", [])
        for c in candidates:
            c_norm = str(c).strip().lower().replace(" and ", "/").replace(" & ", "/").replace(" @ ", "/").replace(" at ", "/")
            c_norm = re.sub(r"\s*/\s*", "/", c_norm)
            if c_norm == lower:
                return item["name"].lower().replace(" and ", "/").replace(" & ", "/").replace(" @ ", "/").replace(" at ", "/")
    return lower

def main():
    df = pd.read_csv(CSV_PATH)
    df["start_time"] = pd.to_datetime(df["start_time"], format="ISO8601", utc=True)
    df = df.sort_values(["user_id", "start_time"]).reset_index(drop=True)

    # Normalize stop names
    lib = load_stops_library()
    if "start_stop" in df.columns:
        df["start_stop"] = df["start_stop"].apply(lambda x: canonicalize_stop(x, lib))
    if "end_stop" in df.columns:
        df["end_stop"] = df["end_stop"].apply(lambda x: canonicalize_stop(x, lib))

    # Replicate journey grouping
    max_gap_minutes = 45
    df["journey_group"] = None

    has_journey = df["journey_id"].notna()
    df.loc[has_journey, "journey_group"] = "j_" + df.loc[has_journey, "journey_id"].astype(str)

    no_journey = df["journey_id"].isna()
    for user, group in df[no_journey].groupby("user_id"):
        group = group.sort_values("start_time")
        current_group = 0
        last_time = None
        for idx, row in group.iterrows():
            if last_time is None or (row["start_time"] - last_time) > timedelta(minutes=max_gap_minutes):
                current_group += 1
            df.at[idx, "journey_group"] = f"time_{user}_{current_group}"
            last_time = row["start_time"]

    df["journey_group"] = df["journey_group"].fillna("orphan")
    df["journey_position"] = df.groupby("journey_group").cumcount() + 1

    # Focus on trips with previous context
    has_context = df["journey_position"] > 1
    context_df = df[has_context & df["prev_route"].notna() & df["start_stop"].notna()].copy()

    # Previous route in journey
    context_df["prev_route_in_journey"] = context_df.groupby("journey_group")["route"].shift(1)
    context_df = context_df[context_df["prev_route_in_journey"].notna()]

    # Create bucket key
    context_df["bucket"] = (
        context_df["start_stop"].astype(str) + " | came from route " + context_df["prev_route_in_journey"].astype(str)
    )

    # Aggregate per bucket
    bucket_stats = context_df.groupby("bucket").agg(
        observations=("route", "count"),
        most_common_next_route=("route", lambda x: x.value_counts().index[0]),
    ).reset_index()

    multi_obs = bucket_stats[bucket_stats["observations"] >= 2].sort_values("observations", ascending=False)

    print("=== Real-world buckets with repeated observations ===\n")
    print(f"Total buckets that have been seen 2+ times: {len(multi_obs)}\n")

    print("Top ones (stop + incoming route → most common next route):\n")
    for i, row in enumerate(multi_obs.itertuples(), 1):
        print(f"{i:2}.  Seen {int(row.observations):2} times  →  Usually take route {row.most_common_next_route}")
        print(f"    When at: {row.bucket}\n")

    print(f"\n(Showing all {len(multi_obs)} buckets that have 2+ observations)")

if __name__ == "__main__":
    main()
