# Model Log

Accuracy history for each version of the TransitStats Prediction Engine.
One entry per trained version. See `docs/ENGINE.md` for full engineering notes.

---

## V4 — Logistic Regression

| Field | Value |
|---|---|
| **Date trained** | 2026-04-13 |
| **Algorithm** | Logistic Regression (scikit-learn, `class_weight='balanced'`, `max_iter=1000`) |
| **Trip count** | 385 (Jan–Apr 2026) |
| **Top-1 accuracy** | 52.1% |
| **Top-3 accuracy** | 74.6% |
| **Classes** | 14 routes |
| **Features** | hour_sin/cos, day_sin/cos, start_stop (one-hot, 127 stops) |
| **Status** | Shadow mode (live alongside V3) |

**Notes:** Strong on dominant routes (1, 2, 510). Weak on rare routes with < 5 trips. Correctly inferred stop→route geography from trip history alone (no GTFS given).

---

## V5 — XGBoost

| Field | Value |
|---|---|
| **Date benchmarked** | 2026-04-13 |
| **Algorithm** | XGBoost (`n_estimators=200`, `max_depth=4`, `learning_rate=0.1`) |
| **Trip count** | 385 (same dataset as V4) |
| **Top-1 accuracy** | 60.6% (+8.5pp vs V4) |
| **Top-3 accuracy** | 80.3% (+5.6pp vs V4) |
| **Classes** | 14 routes |
| **Features** | Same as V4 (hour_sin/cos, day_sin/cos, start_stop one-hot) |
| **Status** | Shadow mode (live alongside V3 and V4) |

**Notes:** Beats V4 on identical features — gain comes entirely from XGBoost discovering stop × time-of-day interactions the linear model can't express. Tested adding `minutes_since_last_trip` and `prev_route` — both hurt accuracy at this dataset size (385 trips). Revisit at ~1000 trips.
