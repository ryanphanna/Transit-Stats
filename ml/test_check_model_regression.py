import json
import tempfile
import unittest
from pathlib import Path

from check_model_regression import compare_models


def write_meta(directory, filename, top1, top3):
    (Path(directory) / filename).write_text(json.dumps({
        "top1_accuracy": top1,
        "top3_accuracy": top3,
        "n_trips": 100,
        "classes": ["a", "b"],
    }), encoding="utf-8")


class ModelRegressionTests(unittest.TestCase):
    def test_allows_small_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            baseline = Path(tmp) / "baseline"
            candidate = Path(tmp) / "candidate"
            baseline.mkdir()
            candidate.mkdir()
            for filename in (
                "model_v4_meta.json",
                "model_v4_endstop_meta.json",
                "model_v5_meta.json",
                "model_v5_endstop_meta.json",
            ):
                write_meta(baseline, filename, 0.80, 0.95)
                write_meta(candidate, filename, 0.76, 0.91)

            _, failures = compare_models(baseline, candidate)
            self.assertEqual(failures, [])

    def test_rejects_material_drop(self):
        with tempfile.TemporaryDirectory() as tmp:
            baseline = Path(tmp) / "baseline"
            candidate = Path(tmp) / "candidate"
            baseline.mkdir()
            candidate.mkdir()
            for filename in (
                "model_v4_meta.json",
                "model_v4_endstop_meta.json",
                "model_v5_meta.json",
                "model_v5_endstop_meta.json",
            ):
                write_meta(baseline, filename, 0.80, 0.95)
                write_meta(candidate, filename, 0.74, 0.95)

            _, failures = compare_models(baseline, candidate)
            self.assertEqual(len(failures), 4)

    def test_missing_candidate_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            baseline = Path(tmp) / "baseline"
            candidate = Path(tmp) / "candidate"
            baseline.mkdir()
            candidate.mkdir()
            write_meta(baseline, "model_v4_meta.json", 0.80, 0.95)

            _, failures = compare_models(baseline, candidate)
            self.assertEqual(len(failures), 1)


if __name__ == "__main__":
    unittest.main()
