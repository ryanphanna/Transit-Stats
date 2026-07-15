import argparse
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))

import v6_eval_against_shadow as evaluator
from route_normalization import configure_from_dict, reset_policies


def trip(trip_id, route, start_stop, end_stop, minute, direction="Southbound", user_id="u1"):
    return evaluator.TripRow(
        trip_id=trip_id,
        user_id=user_id,
        route=route,
        agency="TTC",
        direction=direction,
        start_stop=start_stop,
        end_stop=end_stop,
        start_time=datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc) + timedelta(minutes=minute),
        raw={},
    )


def args(min_bucket=2):
    return argparse.Namespace(agency="TTC", min_bucket=min_bucket)


class V6EvalAgainstShadowTest(unittest.TestCase):
    def setUp(self):
        reset_policies()
        configure_from_dict({"PRIMARY": "collapse", "DEFAULT": "preserve_variant"})

    def test_route_baseline_uses_prior_sequence_without_leaking_current_trip(self):
        trips = {
            "a1": trip("a1", "1", "Davisville", "Spadina Station", 1),
            "a2": trip("a2", "510", "Spadina Station", "Queens Quay", 2),
            "b1": trip("b1", "1", "Davisville", "Spadina Station", 3),
            "b2": trip("b2", "510", "Spadina Station", "Queens Quay", 4),
            "c1": trip("c1", "1", "Davisville", "Spadina Station", 5),
            "c2": trip("c2", "510", "Spadina Station", "Queens Quay", 6),
            "d1": trip("d1", "1", "Davisville", "Spadina Station", 7),
            "eval": trip("eval", "510", "Spadina Station", "Queens Quay", 8),
        }

        predictions = evaluator.evaluate_v6_route(trips, ["eval"], args())

        self.assertEqual(predictions["eval"].predicted, "510")
        self.assertTrue(predictions["eval"].hit)
        self.assertEqual(predictions["eval"].strategy, "start_stop+prev_route+prev_end+hour+day")
        self.assertEqual(predictions["eval"].confidence, 1.0)

    def test_route_baseline_does_not_use_future_trips_to_satisfy_bucket(self):
        trips = {
            "eval": trip("eval", "510", "Spadina Station", "Queens Quay", 1),
            "future1": trip("future1", "510", "Spadina Station", "Queens Quay", 2),
            "future2": trip("future2", "510", "Spadina Station", "Queens Quay", 3),
        }

        predictions = evaluator.evaluate_v6_route(trips, ["eval"], args())

        self.assertNotIn("eval", predictions)

    def test_endstop_baseline_uses_route_start_direction_previous_route_context(self):
        trips = {
            "a1": trip("a1", "1", "Davisville", "Spadina Station", 1),
            "a2": trip("a2", "510", "Spadina Station", "Queens Quay West at Lower Spadina Ave East Side", 2),
            "b1": trip("b1", "1", "Davisville", "Spadina Station", 3),
            "b2": trip("b2", "510", "Spadina Station", "Queens Quay West at Lower Spadina Ave East Side", 4),
            "c1": trip("c1", "1", "Davisville", "Spadina Station", 5),
            "c2": trip("c2", "510", "Spadina Station", "Queens Quay West at Lower Spadina Ave East Side", 6),
            "d1": trip("d1", "1", "Davisville", "Spadina Station", 7),
            "eval": trip("eval", "510", "Spadina Station", "Queens Quay West at Lower Spadina Ave East Side", 8),
        }

        predictions = evaluator.evaluate_v6_endstop(trips, ["eval"], args())

        self.assertEqual(predictions["eval"].predicted, "queens quay west/lower spadina ave east side")
        self.assertTrue(predictions["eval"].hit)
        self.assertEqual(predictions["eval"].strategy, "route+start_stop+direction+prev_route+prev_end+gap+hour+day")

    def test_endstop_baseline_filters_candidates_to_topology_legal_stops(self):
        trips = {
            "illegal1": trip("illegal1", "510", "Spadina Station", "Davisville", 1),
            "illegal2": trip("illegal2", "510", "Spadina Station", "Davisville", 2),
            "illegal3": trip("illegal3", "510", "Spadina Station", "Davisville", 3),
            "legal1": trip("legal1", "510", "Spadina Station", "Queens Quay West at Lower Spadina Ave East Side", 4),
            "legal2": trip("legal2", "510", "Spadina Station", "Queens Quay West at Lower Spadina Ave East Side", 5),
            "eval": trip("eval", "510", "Spadina Station", "Queens Quay West at Lower Spadina Ave East Side", 6),
        }

        predictions = evaluator.evaluate_v6_endstop(trips, ["eval"], args())

        self.assertEqual(predictions["eval"].predicted, "queens quay west/lower spadina ave east side")
        self.assertTrue(predictions["eval"].hit)
        self.assertNotEqual(predictions["eval"].predicted, "davisville")

    def test_topology_legal_endstops_uses_directional_510_platform_labels(self):
        topology = evaluator.load_topology()

        legal = evaluator.topology_legal_endstops(topology, "510", "Spadina Station", "Southbound", "TTC")

        self.assertIn("queens quay west/lower spadina ave east side", legal)
        self.assertNotIn("davisville", legal)

    def test_topology_canonical_stop_collapses_station_suffix_aliases(self):
        topology = evaluator.load_topology()

        self.assertEqual(
            evaluator.topology_canonical_stop(topology, "1", "College Station", "Southbound", "TTC"),
            "college",
        )
        self.assertEqual(
            evaluator.topology_canonical_stop(topology, "2", "Bay Station", "Westbound", "TTC"),
            "bay",
        )

    def test_topology_canonical_stop_keeps_directional_platforms_distinct(self):
        topology = evaluator.load_topology()

        self.assertEqual(
            evaluator.topology_canonical_stop(topology, "510", "Spadina Ave at Nassau St", "Southbound", "TTC"),
            "spadina ave/nassau st",
        )
        self.assertEqual(
            evaluator.topology_canonical_stop(topology, "510", "Spadina Ave at Nassau St South Side", "Southbound", "TTC"),
            "spadina ave/nassau st south side",
        )

    def test_gap_bucket_separates_transfer_and_separate_patterns(self):
        self.assertEqual(
            evaluator.gap_bucket(
                datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc),
                datetime(2026, 7, 15, 12, 20, tzinfo=timezone.utc),
            ),
            "transfer",
        )
        self.assertEqual(
            evaluator.gap_bucket(
                datetime(2026, 7, 15, 8, 0, tzinfo=timezone.utc),
                datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc),
            ),
            "separate",
        )

    def test_endstop_baseline_uses_gap_context_when_supported(self):
        trips = {
            "transfer_prev1": trip("transfer_prev1", "1", "Davisville", "Spadina Station", 0),
            "transfer_end1": trip("transfer_end1", "510", "Spadina Station", "Queens Quay West at Lower Spadina Ave East Side", 10),
            "transfer_prev2": trip("transfer_prev2", "1", "Davisville", "Spadina Station", 20),
            "transfer_end2": trip("transfer_end2", "510", "Spadina Station", "Queens Quay West at Lower Spadina Ave East Side", 30),
            "separate_prev1": trip("separate_prev1", "1", "Davisville", "Spadina Station", 40),
            "separate_end1": trip("separate_end1", "510", "Spadina Station", "Spadina Ave at Nassau St South Side", 180),
            "separate_prev2": trip("separate_prev2", "1", "Davisville", "Spadina Station", 181),
            "separate_end2": trip("separate_end2", "510", "Spadina Station", "Spadina Ave at Nassau St South Side", 320),
            "eval_prev": trip("eval_prev", "1", "Davisville", "Spadina Station", 321),
            "eval": trip("eval", "510", "Spadina Station", "Queens Quay West at Lower Spadina Ave East Side", 330),
        }

        predictions = evaluator.evaluate_v6_endstop(trips, ["eval"], args())

        self.assertEqual(predictions["eval"].predicted, "queens quay west/lower spadina ave east side")
        self.assertTrue(predictions["eval"].hit)
        self.assertIn("+gap", predictions["eval"].strategy)

    def test_ladder_marks_equal_accuracy_as_fail(self):
        summary = {
            "V3": {"hits": 2, "total": 4, "accuracy": 0.5},
            "V4": {"hits": 2, "total": 4, "accuracy": 0.5},
            "V5": {"hits": 3, "total": 4, "accuracy": 0.75},
        }

        rows = evaluator.ladder(summary, ["V3", "V4", "V5"])

        self.assertEqual(rows[0]["status"], "FAIL")
        self.assertEqual(rows[1]["status"], "PASS")

    def test_clean_trip_rejects_correction_blocked_trip(self):
        parsed_args = argparse.Namespace(user_id="u1", agency="TTC")
        row = evaluator.clean_trip("bad", {
            "userId": "u1",
            "agency": "TTC",
            "route": "510",
            "direction": "Southbound",
            "startStopName": "Spadina Station",
            "endStopName": "Queens Quay",
            "startTime": datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc),
            "endTime": datetime(2026, 7, 15, 12, 10, tzinfo=timezone.utc),
            "stop_matched": True,
            "correctedFields": ["route"],
        }, parsed_args, since=None)

        self.assertIsNone(row)


if __name__ == "__main__":
    unittest.main()
