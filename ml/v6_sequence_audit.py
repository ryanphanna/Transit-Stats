"""
V6 Sequence Signal Audit (Small Scientific Experiment)

Hypothesis:
  Adding explicit context from the previous 2-3 trips in a journey provides
  meaningful additional predictive signal for route and end-stop prediction,
  beyond what V5 currently uses (mainly last_end_stop + prev_route + gap).

This script is intentionally lightweight — no model training, just measurement
of signal availability and basic correlations on existing data.

Run:
  python ml/v6_sequence_audit.py
"""

import pandas as pd
import numpy as np
from datetime import timedelta
import os
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
    lower = __import__("re").sub(r"\s*/\s*", "/", lower)

    for item in lib:
        candidates = [item["name"]] + item.get("aliases", [])
        for c in candidates:
            c_norm = str(c).strip().lower().replace(" and ", "/").replace(" & ", "/").replace(" @ ", "/").replace(" at ", "/")
            c_norm = __import__("re").sub(r"\s*/\s*", "/", c_norm)
            if c_norm == lower:
                return item["name"].lower().replace(" and ", "/").replace(" & ", "/").replace(" @ ", "/").replace(" at ", "/")
    return lower


def load_data():
    df = pd.read_csv(CSV_PATH)
    df['start_time'] = pd.to_datetime(df['start_time'], format='ISO8601', utc=True)
    df = df.sort_values(['user_id', 'start_time']).reset_index(drop=True)
    print(f"Loaded {len(df)} trips")

    # Normalize stop names using the curated stops library
    lib = load_stops_library()
    if "start_stop" in df.columns:
        df["start_stop"] = df["start_stop"].apply(lambda x: canonicalize_stop(x, lib))
    if "end_stop" in df.columns:
        df["end_stop"] = df["end_stop"].apply(lambda x: canonicalize_stop(x, lib))

    print("Stop names normalized against stops library")
    return df


def create_journey_groups(df, max_gap_minutes=45):
    """
    Create journey/session groups.
    - Use journey_id when available.
    - Fall back to time-based grouping per user (trips within max_gap_minutes).
    """
    df = df.copy()
    df['journey_group'] = None

    # 1. Use real journey_id where present
    has_journey = df['journey_id'].notna()
    df.loc[has_journey, 'journey_group'] = 'j_' + df.loc[has_journey, 'journey_id'].astype(str)

    # 2. For rows without journey_id, do time-based grouping per user
    no_journey = df['journey_id'].isna()
    for user, group in df[no_journey].groupby('user_id'):
        group = group.sort_values('start_time')
        current_group = 0
        last_time = None

        for idx, row in group.iterrows():
            if last_time is None or (row['start_time'] - last_time) > timedelta(minutes=max_gap_minutes):
                current_group += 1
            df.at[idx, 'journey_group'] = f"time_{user}_{current_group}"
            last_time = row['start_time']

    # Combine
    df['journey_group'] = df['journey_group'].fillna('orphan')

    print(f"Journey groups created. Unique groups: {df['journey_group'].nunique()}")
    print(f"Trips using real journey_id: {has_journey.sum()}")
    print(f"Trips using time-based fallback: {no_journey.sum()}")

    return df


def analyze_sequence_depth(df):
    """How many previous trips in the same journey do we actually have?"""
    df = df.copy()
    df['journey_position'] = df.groupby('journey_group').cumcount() + 1
    df['prev_in_journey'] = df.groupby('journey_group')['journey_position'].shift(1)

    print("\n=== Sequence Depth in Journeys ===")
    print(df['journey_position'].value_counts().sort_index().head(10))

    has_prev = df['journey_position'] > 1
    print(f"\nTrips with at least 1 previous trip in same journey: {has_prev.sum()} / {len(df)}")

    return df


def analyze_simple_signals(df):
    """
    Very basic measurement of sequence signal.
    How often does previous route predict current route within the same journey?
    """
    df = df.copy()
    df['prev_route_in_journey'] = df.groupby('journey_group')['route'].shift(1)
    df['same_route_as_prev'] = df['route'] == df['prev_route_in_journey']

    has_prev = df['journey_position'] > 1
    subset = df[has_prev]

    if len(subset) == 0:
        print("\nNo trips with previous journey context.")
        return df

    match_rate = subset['same_route_as_prev'].mean()
    print(f"\n=== Simple Sequence Signal (Route) ===")
    print(f"Trips with previous trip in journey: {len(subset)}")
    print(f"Current route == previous route in same journey: {match_rate:.1%}")

    # Also look at start_stop == previous end_stop (transfer signal)
    df['prev_end_stop'] = df.groupby('journey_group')['end_stop'].shift(1)
    df['is_transfer'] = df['start_stop'] == df['prev_end_stop']

    transfer_subset = df[has_prev]
    transfer_rate = transfer_subset['is_transfer'].mean()
    print(f"\nTrips where current start == previous end (potential transfer): {transfer_rate:.1%}")

    # End-stop signal: does previous end_stop help predict current end_stop?
    df['prev_end_for_current'] = df.groupby('journey_group')['end_stop'].shift(1)
    endstop_subset = df[has_prev & df['end_stop'].notna() & df['prev_end_for_current'].notna()]
    if len(endstop_subset) > 0:
        same_end_rate = (endstop_subset['end_stop'] == endstop_subset['prev_end_for_current']).mean()
        print(f"Current end_stop == previous end_stop (same journey): {same_end_rate:.1%} (n={len(endstop_subset)})")

    return df


def analyze_transfer_baseline(df):
    """
    Chosen next cheap experiment (v2):

    Hypothesis:
      A simple frequency-based "most common next route given (start_stop + previous route)"
      will show meaningful lift over the global most-common-route baseline on trips
      that have journey context. This tests the practical value of the transfer signal.

    This is still pure measurement — no model training.
    """
    has_context = df['journey_position'] > 1
    context_df = df[has_context & df['prev_route_in_journey'].notna() & df['start_stop'].notna()].copy()

    if len(context_df) == 0:
        print("\nNo trips with previous journey context for transfer baseline.")
        return

    print("\n=== Transfer Baseline Predictor (v2) ===")
    print(f"Trips with previous context: {len(context_df)}")

    # Build empirical "most common next route" for each (start_stop, prev_route) bucket
    context_df['bucket'] = context_df['start_stop'].astype(str) + '|' + context_df['prev_route_in_journey'].astype(str)

    bucket_stats = context_df.groupby('bucket').agg(
        actual_route=('route', lambda x: x.value_counts().index[0]),  # most common route in bucket
        count=('route', 'count'),
        correct=('route', lambda x: (x == x.value_counts().index[0]).sum())
    ).reset_index()

    bucket_stats['accuracy_in_bucket'] = bucket_stats['correct'] / bucket_stats['count']

    # For each trip, predict the most common route for its bucket (if we have the bucket stats)
    bucket_lookup = bucket_stats.set_index('bucket')
    context_df['predicted'] = context_df['bucket'].map(bucket_lookup['actual_route'])

    # Only evaluate on buckets we have stats for (all of them in this case)
    eval_df = context_df[context_df['predicted'].notna()]

    if len(eval_df) == 0:
        print("No evaluable trips.")
        return

    hit_rate = (eval_df['route'] == eval_df['predicted']).mean()
    print(f"\nEmpirical transfer baseline accuracy (most common route for (start_stop + prev_route)): {hit_rate:.1%} (n={len(eval_df)})")

    # Global baseline on same subset
    global_most_common = context_df['route'].mode()[0]
    global_baseline = (context_df['route'] == global_most_common).mean()
    print(f"Global most-common-route baseline (on same trips): {global_baseline:.1%}")

    # Sparsity analysis
    multi_obs = (bucket_stats['count'] >= 2).sum()
    print(f"\nUnique (start_stop + prev_route) buckets: {len(bucket_stats)}")
    print(f"Buckets with 2+ observations: {multi_obs}")
    print(f"Median observations per bucket: {bucket_stats['count'].median():.1f}")
    print(f"Max observations in one bucket: {bucket_stats['count'].max()}")

    print("\nInterpretation note:")
    print("  If this number is high and stable, it suggests a simple frequency table on (stop, prev_route)")
    print("  is already a strong cheap feature for V6. If low or very sparse, we need either more data")
    print("  or richer features (time of day, gap, specific stop pairs, etc.).")


if __name__ == "__main__":
    df = load_data()
    df = create_journey_groups(df)
    df = analyze_sequence_depth(df)
    df = analyze_simple_signals(df)

    # Run the chosen v2 experiment
    analyze_transfer_baseline(df)

    print("\n=== v2 complete ===")
    print("Results should be logged in V6_EXPERIMENTS.md with date, hypothesis, n, and interpretation.")