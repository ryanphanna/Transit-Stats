# Model Log

Accuracy history for each trained TransitStats prediction model generation.
One entry per trained version. See `docs/INTELLIGENCE.md` for full engineering notes.

---

## V5.4 — XGBoost End Stop

| Field | Value |
|---|---|
| **Date trained** | 2026-06-09 |
| **Algorithm** | XGBoost (`n_estimators=200`, `max_depth=4`, `learning_rate=0.1`) |
| **Trip count** | 261 (after cleaning) |
| **Top-1 accuracy** | 69.8% |
| **Top-3 accuracy** | 77.4% |
| **Classes** | 18 end stops |
| **Features** | hour_sin/cos, day_sin/cos, start_stop (one-hot), route (one-hot), prev_route (one-hot), last_end_stop (one-hot), trip gap (`gap_log`, `gap_missing`), **direction (one-hot: northbound/southbound/eastbound/westbound)** |
| **Status** | Shadow mode |

**Notes:** Added direction as a one-hot feature. Root cause of low production accuracy: without direction, Route 1 trips looked identical regardless of whether the user was going to Spadina Station (southbound) or York University (northbound). Top-1 improved 66.0% → 69.8% (+3.8pp) on the same 535-trip/261-cleaned dataset. V5.4 route retrained simultaneously on 535 trips (79.6% top-1). Canonicalization audit confirmed stop name normalization covers 530/535 trips — label fragmentation is not a factor.

---

## V4.4 — Logistic Regression End Stop

| Field | Value |
|---|---|
| **Date trained** | 2026-06-09 |
| **Algorithm** | Logistic Regression (scikit-learn, `class_weight='balanced'`, `max_iter=1000`) |
| **Trip count** | 261 (same dataset as V5.4) |
| **Top-1 accuracy** | 64.2% |
| **Top-3 accuracy** | 83.0% |
| **Classes** | 18 end stops |
| **Features** | Same as V5.4 (including direction) |
| **Status** | Shadow mode |

**Notes:** No improvement over V4.3 (64.2% unchanged). Direction signal may not be sufficient for logistic regression to separate classes at this dataset size — the linear model already partially infers direction from start stop + time.

---

## V5.3 — XGBoost End Stop

| Field | Value |
|---|---|
| **Date trained** | 2026-05-11 |
| **Algorithm** | XGBoost (`n_estimators=200`, `max_depth=4`, `learning_rate=0.1`) |
| **Trip count** | 234 (after cleaning — routes+stops with ≥5 trips, end stops with ≥3 occurrences) |
| **Top-1 accuracy** | 76.6% |
| **Top-3 accuracy** | 89.4% |
| **Classes** | 15 end stops |
| **Features** | hour_sin/cos, day_sin/cos, start_stop (one-hot), route (one-hot), prev_route (one-hot), last_end_stop (one-hot), trip gap (`gap_log`, `gap_missing`) |
| **Status** | Shadow mode |

**Notes:** Marginal dip vs V5.2 (78.7% → 76.6%) on the same 234-trip cleaning slice despite 54 more raw trips exported (483 vs 429). Likely test split variance — the cleaned end stop dataset didn't grow. Route classes expanded from 18 to 20 with new Yonge arm trips starting today, which may shift the feature distribution slightly over time.

---

## V4.3 — Logistic Regression End Stop

| Field | Value |
|---|---|
| **Date trained** | 2026-05-11 |
| **Algorithm** | Logistic Regression (scikit-learn, `class_weight='balanced'`, `max_iter=1000`) |
| **Trip count** | 234 (same dataset as V5.3) |
| **Top-1 accuracy** | 68.1% |
| **Top-3 accuracy** | 93.6% |
| **Classes** | 15 end stops |
| **Features** | Same as V5.3 |
| **Status** | Shadow mode |

**Notes:** Identical to V4.2 — end stop dataset unchanged.

---

## V5.3 — XGBoost Route

| Field | Value |
|---|---|
| **Date trained** | 2026-05-11 |
| **Algorithm** | XGBoost (`n_estimators=200`, `max_depth=4`, `learning_rate=0.1`) |
| **Trip count** | 438 (after cleaning) |
| **Top-1 accuracy** | 67.0% |
| **Top-3 accuracy** | 81.8% |
| **Classes** | 20 routes |
| **Features** | hour_sin/cos, day_sin/cos, start_stop (one-hot), last_end_stop (one-hot) |
| **Status** | Shadow mode |

**Notes:** Slight dip vs V5.2 (70.9% → 67.0%) with 2 new route classes from the Yonge arm commute starting today. More classes + same dataset size = harder classification problem. Expect accuracy to recover as Yonge arm trips accumulate.

---

## V4.3 — Logistic Regression Route

| Field | Value |
|---|---|
| **Date trained** | 2026-05-11 |
| **Algorithm** | Logistic Regression (scikit-learn, `class_weight='balanced'`, `max_iter=1000`) |
| **Trip count** | 438 (same dataset as V5.3) |
| **Top-1 accuracy** | 60.2% |
| **Top-3 accuracy** | 80.7% |
| **Classes** | 20 routes |
| **Features** | Same as V5.3 |
| **Status** | Shadow mode |

---

## V5.2 — XGBoost End Stop

| Field | Value |
|---|---|
| **Date trained** | 2026-05-09 |
| **Algorithm** | XGBoost (`n_estimators=200`, `max_depth=4`, `learning_rate=0.1`) |
| **Trip count** | 234 (after cleaning — routes+stops with ≥5 trips, end stops with ≥3 occurrences) |
| **Top-1 accuracy** | 78.7% |
| **Top-3 accuracy** | 89.4% |
| **Classes** | 15 end stops |
| **Features** | hour_sin/cos, day_sin/cos, start_stop (one-hot), route (one-hot), prev_route (one-hot), last_end_stop (one-hot), trip gap (`gap_log`, `gap_missing`) |
| **Status** | Shadow mode |

**Notes:** Large top-1 gain versus the 2026-04-14 end-stop model after a much bigger reviewed dataset export. Adding `prev_route` and trip-gap features did not move V5 on this split, which suggests the current XGBoost setup is not yet extracting extra value from the new sequence signals at this dataset size.

---

## V4.2 — Logistic Regression End Stop

| Field | Value |
|---|---|
| **Date trained** | 2026-05-09 |
| **Algorithm** | Logistic Regression (scikit-learn, `class_weight='balanced'`, `max_iter=1000`) |
| **Trip count** | 234 (same dataset as V5.2) |
| **Top-1 accuracy** | 68.1% |
| **Top-3 accuracy** | 93.6% |
| **Classes** | 15 end stops |
| **Features** | hour_sin/cos, day_sin/cos, start_stop (one-hot), route (one-hot), prev_route (one-hot), last_end_stop (one-hot), trip gap (`gap_log`, `gap_missing`) |
| **Status** | Shadow mode |

**Notes:** The same `prev_route` and trip-gap experiment helped V4 materially, improving both top-1 and top-3 accuracy on the held-out split. This suggests the new sequence features are directionally useful, even though V5 did not benefit yet.

---

## V5.2 — XGBoost Route

| Field | Value |
|---|---|
| **Date trained** | 2026-05-09 |
| **Algorithm** | XGBoost (`n_estimators=200`, `max_depth=4`, `learning_rate=0.1`) |
| **Trip count** | 429 (after cleaning) |
| **Top-1 accuracy** | 70.9% |
| **Top-3 accuracy** | 82.6% |
| **Classes** | 18 routes |
| **Features** | hour_sin/cos, day_sin/cos, start_stop (one-hot), last_end_stop (one-hot) |
| **Status** | Shadow mode |

**Notes:** Big improvement over the 2026-04-13 route benchmark. The key fix was agency-aware route normalization: TTC branch/shuttle/short-turn labels now collapse into their base route family, while non-TTC labels like `Red`, `K`, and `N` keep their identity. Remaining misses still cluster around overlapping TTC corridors, especially `1`, `2`, `510`, and `506`, where the same stations or nearby aliases appear across multiple route families.

---

## V4.2 — Logistic Regression Route

| Field | Value |
|---|---|
| **Date trained** | 2026-05-09 |
| **Algorithm** | Logistic Regression (scikit-learn, `class_weight='balanced'`, `max_iter=1000`) |
| **Trip count** | 429 (same dataset as V5.2) |
| **Top-1 accuracy** | 62.8% |
| **Top-3 accuracy** | 84.9% |
| **Classes** | 18 routes |
| **Features** | hour_sin/cos, day_sin/cos, start_stop (one-hot), last_end_stop (one-hot) |
| **Status** | Shadow mode |

---

## V5.1 — XGBoost End Stop

| Field | Value |
|---|---|
| **Date trained** | 2026-04-14 |
| **Algorithm** | XGBoost (`n_estimators=200`, `max_depth=4`, `learning_rate=0.1`) |
| **Trip count** | 114 (after cleaning — routes+stops with ≥5 trips, end stops with ≥3 occurrences) |
| **Top-1 accuracy** | 47.8% |
| **Top-3 accuracy** | 95.7% |
| **Classes** | 11 end stops |
| **Features** | hour_sin/cos, day_sin/cos, start_stop (one-hot), route (one-hot) |
| **Topology filter** | Pre-filter before probability read — impossible stops zeroed, renormalized |
| **Status** | Shadow mode |

---

## V4.1 — Logistic Regression End Stop

| Field | Value |
|---|---|
| **Date trained** | 2026-04-14 |
| **Algorithm** | Logistic Regression (scikit-learn, `class_weight='balanced'`, `max_iter=1000`) |
| **Trip count** | 114 (same dataset as V5.1) |
| **Top-1 accuracy** | 39.1% |
| **Top-3 accuracy** | 87.0% |
| **Classes** | 11 end stops |
| **Features** | hour_sin/cos, day_sin/cos, start_stop (one-hot), route (one-hot) |
| **Topology filter** | Pre-filter before softmax — impossible stops set to -Infinity |
| **Status** | Shadow mode |

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
