"""
Backfill corrected isHit values for V5.2 and V5.3 predictionStats records
that were graded against the raw (unnormalized) route, causing every prediction
to score as a miss even when the model was right.

Also corrects the predictionAccuracy running counters for affected users.

Usage:
    python3 ml/backfill_v5_grades.py
"""

import os
import re
import sys
from collections import defaultdict

import firebase_admin
from firebase_admin import credentials, firestore

KEY_PATH = os.path.expanduser(
    "~/Desktop/Dev/Credentials/Firebase for Transit Stats.json"
)

AFFECTED_VERSIONS = {"5.2", "5.3"}


def normalize_route(route, agency=None):
    """Mirror the JS normalizeRouteForGrading logic."""
    r = str(route).strip()
    if str(agency or "").strip() == "TTC":
        m = re.match(r"^(\d+)", r)
        return m.group(1) if m else r
    compact = re.match(r"^(\d+)([a-zA-Z]+)$", r)
    if compact:
        return f"{compact.group(1)}{compact.group(2).upper()}"
    if re.match(r"^[a-zA-Z]$", r):
        return r.upper()
    return r


def main():
    if not os.path.exists(KEY_PATH):
        print(f"ERROR: Key not found at {KEY_PATH}")
        sys.exit(1)

    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("Fetching affected predictionStats records...")
    docs = list(db.collection("predictionStats").stream())

    affected = [
        (doc.id, doc.to_dict())
        for doc in docs
        if str(doc.to_dict().get("version", "")) in AFFECTED_VERSIONS
    ]

    print(f"Found {len(affected)} records with versions {AFFECTED_VERSIONS}\n")

    if not affected:
        print("Nothing to backfill.")
        return

    # Re-grade each record
    accuracy_delta = defaultdict(lambda: {"v5Total": 0, "v5Hits": 0, "v5PartialHits": 0})
    updates = []

    for doc_id, d in affected:
        predicted_raw = str(d.get("predicted") or "").split(" from ")[0].strip()
        actual_raw = str(d.get("actual") or "").split(" from ")[0].split(" ")[0].strip()
        agency = d.get("agency")

        pred_norm = normalize_route(predicted_raw, agency)
        actual_norm = normalize_route(actual_raw, agency)
        new_is_hit = pred_norm == actual_norm and pred_norm != ""

        old_is_hit = bool(d.get("isHit"))

        if new_is_hit != old_is_hit:
            updates.append((doc_id, new_is_hit, old_is_hit, d.get("userId"), d.get("version"),
                            predicted_raw, actual_raw, pred_norm, actual_norm))

            user_id = d.get("userId")
            if user_id:
                if new_is_hit and not old_is_hit:
                    accuracy_delta[user_id]["v5Hits"] += 1
                elif old_is_hit and not new_is_hit:
                    accuracy_delta[user_id]["v5Hits"] -= 1

    print(f"Records needing correction: {len(updates)}")
    print(f"Records already correct:    {len(affected) - len(updates)}\n")

    for doc_id, new_hit, old_hit, uid, version, pred_raw, act_raw, pred_norm, act_norm in updates:
        change = "MISS→HIT" if new_hit else "HIT→MISS"
        print(f"  [{change}] v{version} | '{pred_raw}' (→'{pred_norm}') vs '{act_raw}' (→'{act_norm}') | user={uid}")

    if not updates:
        print("All records already correct — nothing to write.")
        return

    print(f"\nWriting {len(updates)} corrections to predictionStats...")
    batch = db.batch()
    for doc_id, new_hit, *_ in updates:
        ref = db.collection("predictionStats").document(doc_id)
        batch.update(ref, {"isHit": new_hit, "isPartialHit": False, "backfilled": True})
    batch.commit()
    print("predictionStats updated.")

    if accuracy_delta:
        print(f"\nCorrecting predictionAccuracy for {len(accuracy_delta)} user(s)...")
        for user_id, delta in accuracy_delta.items():
            if delta["v5Hits"] != 0:
                db.collection("predictionAccuracy").document(user_id).set({
                    "v5Hits": firestore.Increment(delta["v5Hits"]),
                    "lastUpdated": firestore.SERVER_TIMESTAMP,
                }, merge=True)
                print(f"  user={user_id}  v5Hits {'+' if delta['v5Hits'] > 0 else ''}{delta['v5Hits']}")

    print("\nDone.")


if __name__ == "__main__":
    main()
