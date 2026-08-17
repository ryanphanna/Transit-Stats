"""Reject materially weaker candidate models before retrain deployment."""

import argparse
import json
import sys
from pathlib import Path


MODEL_FILES = {
    "V4 route": "model_v4_meta.json",
    "V4 end-stop": "model_v4_endstop_meta.json",
    "V5 route": "model_v5_meta.json",
    "V5 end-stop": "model_v5_endstop_meta.json",
}


def load_metrics(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return {
        "top1": float(data["top1_accuracy"]),
        "top3": float(data["top3_accuracy"]),
        "trips": int(data.get("n_trips", 0)),
        "classes": len(data.get("classes", [])),
    }


def compare_models(baseline_dir, candidate_dir, max_drop=0.05):
    results = []
    failures = []

    for label, filename in MODEL_FILES.items():
        baseline_path = Path(baseline_dir) / filename
        candidate_path = Path(candidate_dir) / filename
        if not baseline_path.exists():
            results.append({"label": label, "status": "no baseline"})
            continue
        if not candidate_path.exists():
            failures.append(f"{label}: candidate metadata is missing ({filename})")
            continue

        baseline = load_metrics(baseline_path)
        candidate = load_metrics(candidate_path)
        top1_drop = baseline["top1"] - candidate["top1"]
        top3_drop = baseline["top3"] - candidate["top3"]
        result = {
            "label": label,
            "status": "pass",
            "baseline": baseline,
            "candidate": candidate,
            "top1_drop": top1_drop,
            "top3_drop": top3_drop,
        }
        if top1_drop > max_drop or top3_drop > max_drop:
            result["status"] = "fail"
            failures.append(
                f"{label}: top-1 dropped {top1_drop:.1%}, top-3 dropped {top3_drop:.1%} "
                f"(limit {max_drop:.1%})"
            )
        results.append(result)

    return results, failures


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--candidate-dir", required=True, type=Path)
    parser.add_argument("--max-drop", type=float, default=0.05)
    args = parser.parse_args(argv)

    results, failures = compare_models(args.baseline_dir, args.candidate_dir, args.max_drop)
    for result in results:
        if result["status"] == "no baseline":
            print(f"{result['label']}: no baseline; allowing initial model")
            continue
        print(
            f"{result['label']}: {result['status']} "
            f"(top-1 {result['baseline']['top1']:.1%} → {result['candidate']['top1']:.1%}, "
            f"top-3 {result['baseline']['top3']:.1%} → {result['candidate']['top3']:.1%})"
        )

    if failures:
        print("\nModel regression gate failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print("\nModel regression gate passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
