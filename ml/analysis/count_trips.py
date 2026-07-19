"""
Quick diagnostic — counts all trips in Firestore and breaks down why trips
are excluded from the ML export.

Usage:
    python ml/count_trips.py
"""

import os
import sys

import firebase_admin
from firebase_admin import credentials, firestore

KEY_PATH = os.path.expanduser(
    "~/Desktop/Dev/Credentials/Firebase for Transit Stats.json"
)


def is_stop_matched(d):
    if d.get("stop_matched") is not None:
        return bool(d.get("stop_matched"))
    return bool(d.get("verified"))


def main():
    if not os.path.exists(KEY_PATH):
        print(f"ERROR: Key not found at {KEY_PATH}")
        sys.exit(1)

    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("Fetching trips...")
    docs = list(db.collection("trips").stream())
    total = len(docs)

    counts = {
        "no_end_time": 0,
        "no_end_stop": 0,
        "discarded": 0,
        "incomplete": 0,
        "needs_review": 0,
        "not_stop_matched": 0,
        "no_route_or_start": 0,
        "exported": 0,
    }

    for doc in docs:
        d = doc.to_dict()

        has_end_stop = d.get("endStopName") or d.get("endStop")

        if not d.get("endTime"):
            counts["no_end_time"] += 1
            continue
        if not has_end_stop:
            counts["no_end_stop"] += 1
            continue
        if d.get("discarded"):
            counts["discarded"] += 1
            continue
        if d.get("incomplete"):
            counts["incomplete"] += 1
            continue
        if d.get("needs_review"):
            counts["needs_review"] += 1
            continue
        if not is_stop_matched(d):
            counts["not_stop_matched"] += 1
            continue
        if not d.get("route") or not (d.get("startStop") or d.get("startStopName")):
            counts["no_route_or_start"] += 1
            continue

        counts["exported"] += 1

    print(f"\nTotal trips in Firestore: {total}")
    print(f"  Exported (pass all filters): {counts['exported']}")
    print(f"\nSkip breakdown:")
    print(f"  No end time (active/abandoned):  {counts['no_end_time']}")
    print(f"  No end stop recorded:            {counts['no_end_stop']}")
    print(f"  Discarded:                       {counts['discarded']}")
    print(f"  Incomplete (FORGOT):             {counts['incomplete']}")
    print(f"  Needs review:                    {counts['needs_review']}")
    print(f"  No stop_matched or verified:     {counts['not_stop_matched']}")
    print(f"  Missing route or start stop:     {counts['no_route_or_start']}")


if __name__ == "__main__":
    main()
