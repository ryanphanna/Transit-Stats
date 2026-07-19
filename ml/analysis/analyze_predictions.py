"""
Analyze predictionStats from Firestore — confusion matrix, confidence
calibration, version breakdown, and miss patterns.

Usage:
    python3 ml/analysis/analyze_predictions.py
"""

import os
import sys
from collections import Counter, defaultdict

import firebase_admin
from firebase_admin import credentials, firestore

KEY_PATH = os.path.expanduser(
    "~/Desktop/Dev/Credentials/Firebase for Transit Stats.json"
)
HIGH_IMPACT_FIELDS = {
    "route",
    "direction",
    "agency",
    "startStop",
    "startStopCode",
    "startStopName",
    "endStop",
    "endStopCode",
    "endStopName",
}


def pct(n, total):
    return f"{100 * n / total:.1f}%" if total else "—"


def trip_has_blocking_correction(trip):
    if not trip:
        return False
    if trip.get("exclude_from_training") or trip.get("exclude_from_accuracy") or trip.get("needs_reprocess"):
        return True
    corrected_fields = trip.get("correctedFields") or []
    return any(field in HIGH_IMPACT_FIELDS for field in corrected_fields)


def main():
    if not os.path.exists(KEY_PATH):
        print(f"ERROR: Key not found at {KEY_PATH}")
        sys.exit(1)

    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("Fetching predictionStats...\n")
    docs = list(db.collection("predictionStats").stream())
    total = len(docs)
    print(f"Total prediction records: {total}\n")

    if total == 0:
        print("No data.")
        return

    rows = [d.to_dict() for d in docs]
    trip_ids = {r.get("tripId") for r in rows if r.get("tripId")}
    trip_lookup = {}
    for trip_id in trip_ids:
        trip_doc = db.collection("trips").document(trip_id).get()
        if trip_doc.exists:
            trip_lookup[trip_id] = trip_doc.to_dict()

    rows = [
        r for r in rows
        if not trip_has_blocking_correction(trip_lookup.get(r.get("tripId")))
    ]
    print(f"Usable prediction records after correction filter: {len(rows)}\n")

    # ── Route predictions ──────────────────────────────────────────────────
    route_rows = [r for r in rows if r.get("predicted") and r.get("actual")]
    hits = [r for r in route_rows if r.get("isHit")]
    misses = [r for r in route_rows if not r.get("isHit")]

    print("=" * 60)
    print("ROUTE PREDICTION OVERVIEW")
    print("=" * 60)
    print(f"  Records with predicted+actual:  {len(route_rows)}")
    print(f"  Hits:    {len(hits)}  ({pct(len(hits), len(route_rows))})")
    print(f"  Misses:  {len(misses)}  ({pct(len(misses), len(route_rows))})")

    # By version
    print("\n--- By model version ---")
    by_version = defaultdict(lambda: {"hits": 0, "total": 0})
    for r in route_rows:
        v = r.get("version", "unknown")
        by_version[v]["total"] += 1
        if r.get("isHit"):
            by_version[v]["hits"] += 1
    for v, d in sorted(by_version.items(), key=lambda x: str(x[0])):
        print(f"  {str(v):10s}  {d['hits']}/{d['total']}  ({pct(d['hits'], d['total'])})")

    # Confusion — top miss pairs
    print("\n--- Top route confusion pairs (predicted → actual) ---")
    confusion = Counter()
    for r in misses:
        pair = f"{r.get('predicted')} → {r.get('actual')}"
        confusion[pair] += 1
    for pair, count in confusion.most_common(10):
        print(f"  {count:3d}x  {pair}")

    # Miss dominance — is one predicted value dominating misses?
    print("\n--- Most predicted value in misses ---")
    miss_predicted = Counter(r.get("predicted") for r in misses)
    for val, count in miss_predicted.most_common(5):
        print(f"  {count:3d}x  predicted '{val}'")

    # ── Confidence calibration (route) ────────────────────────────────────
    print("\n--- Confidence calibration (route, bucketed) ---")
    buckets = defaultdict(lambda: {"hits": 0, "total": 0})
    for r in route_rows:
        conf = r.get("confidence")
        if conf is None:
            continue
        bucket = (int(conf) // 10) * 10
        buckets[bucket]["total"] += 1
        if r.get("isHit"):
            buckets[bucket]["hits"] += 1
    for b in sorted(buckets):
        d = buckets[b]
        bar = "█" * int(10 * d["hits"] / d["total"]) if d["total"] else ""
        print(f"  {b:3d}–{b+9}%  {bar:10s}  {d['hits']}/{d['total']}  ({pct(d['hits'], d['total'])})")

    # ── End stop predictions ───────────────────────────────────────────────
    end_rows = [r for r in rows if r.get("endStopPredicted") is not None]
    end_hits = [r for r in end_rows if r.get("endStopHit")]
    end_misses = [r for r in end_rows if r.get("endStopHit") is False]

    print("\n")
    print("=" * 60)
    print("END STOP PREDICTION OVERVIEW")
    print("=" * 60)
    print(f"  Records with end stop prediction:  {len(end_rows)}")
    print(f"  Hits:    {len(end_hits)}  ({pct(len(end_hits), len(end_rows))})")
    print(f"  Misses:  {len(end_misses)}  ({pct(len(end_misses), len(end_rows))})")

    if end_misses:
        print("\n--- Top end stop confusion pairs (predicted → actual) ---")
        end_confusion = Counter()
        for r in end_misses:
            pair = f"{r.get('endStopPredicted')} → {r.get('endStopActual')}"
            end_confusion[pair] += 1
        for pair, count in end_confusion.most_common(10):
            print(f"  {count:3d}x  {pair}")

        print("\n--- Most predicted value in end stop misses ---")
        end_miss_pred = Counter(r.get("endStopPredicted") for r in end_misses)
        for val, count in end_miss_pred.most_common(5):
            print(f"  {count:3d}x  predicted '{val}'")

    # ── High-confidence misses ─────────────────────────────────────────────
    print("\n")
    print("=" * 60)
    print("HIGH-CONFIDENCE MISSES (confidence ≥ 70%)")
    print("=" * 60)
    hc_misses = [r for r in misses if (r.get("confidence") or 0) >= 70]
    print(f"  Count: {len(hc_misses)}")
    if hc_misses:
        hc_misses.sort(key=lambda r: r.get("confidence", 0), reverse=True)
        print(f"  {'Conf':>6}  {'Predicted':<20}  {'Actual':<20}  Route")
        for r in hc_misses[:15]:
            print(f"  {r.get('confidence', 0):>5.1f}%  {str(r.get('predicted','')):<20}  {str(r.get('actual','')):<20}  {r.get('route','')}")


if __name__ == "__main__":
    main()
