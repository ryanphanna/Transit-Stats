# Changelog

All notable changes to this project will be documented in this file.

**See also:** [Intelligence notes](docs/INTELLIGENCE.md) · [Transfer Engine notes](docs/TRANSFER_ENGINE.md) · [Network Engine notes](docs/NETWORK_ENGINE.md)

## [1.37.1] - 2026-05-20

### Fixed
- **Prediction audit rows now retain the originating trip ID** (`functions/lib/handlers-trip.js`): All `predictionStats` writes now include `tripId`, so route/end-stop grading rows can be traced back to the exact trip that produced them instead of relying on fuzzy matching by timestamp, version, or labels.

## [1.37.0] - 2026-05-18

### Added
- **Transfer-pair candidate audit tool** (`Tools/audit-transfer-pair-candidates.js`, `functions/lib/transfer.js`, `functions/test_transfer.js`):
  - **Evidence-only mining**: Added `TransferEngine.suggestConnectedPairs()` to surface repeated short-gap stop-pair candidates from real linked journeys without auto-mutating the canonical transfer map.
  - **Review script**: New Firestore-backed audit tool prints candidate connected pairs for a user with count, median gap, gap range, and route-pair evidence so recurring handoffs can be reviewed before promotion into `transfer-connections.js`.

### Fixed
- **Generic TTC transfer names now resolve through the transfer-complex layer** (`functions/lib/db/stops.js`, `functions/lib/handlers-trip.js`, `functions/lib/handlers-utils.js`, `functions/test_stops.js`, `functions/test_handlers.js`): Stop lookup no longer depends only on exact stop-library aliases for generic names like `College`. The resolver now gathers exact and transfer-complex-connected candidates together, then narrows them by `route` and `direction`. This allows behaviors like `506 + College + Westbound -> westbound surface stop`, `1 + College -> subway station`, while still falling back to clarification when direction is missing or ambiguity remains.
- **Stop clarification prompts now expose the physical stop more clearly** (`functions/lib/handlers-utils.js`, `functions/test_handlers.js`): Multi-match SMS prompts now include stronger labels like direction plus `stop ####` when candidates share the same display name or transfer complex, making fallback prompts for cases like `College` materially clearer than a list of near-identical names.

## [1.36.1] - 2026-05-17

### Added
- **Firestore privilege-boundary rules tests** (`tests/firestore.rules.test.js`, `package.json`): Added emulator-backed security tests covering normal profile creation, blocked self-promotion to `isPremium`/`isAdmin`, and admin-only privileged profile updates.

### Fixed
- **Profile privilege escalation via user-writable flags** (`firestore.rules`, `functions/lib/db/users.js`, `functions/lib/handlers-query.js`, `functions/lib/handlers-trip.js`, `functions/test_handlers.js`, `functions/test_dispatcher.js`): Users can no longer promote themselves by editing `profiles/{userId}`. Profile writes now preserve `isPremium` and `isAdmin` unless performed by an actual admin from `allowedUsers`, and backend admin-only behavior now checks `allowedUsers` directly instead of trusting mutable profile fields.
- **Twilio webhook validation logs exposed auth-derived material** (`functions/lib/twilio.js`): Removed `secretPrefix` and full `X-Twilio-Signature` values from production logs while keeping request-shape diagnostics for webhook debugging.

## [1.36.0] - 2026-05-17

### Added
- **NetworkEngine v2.1 — Pure Empirical Learner** (`functions/lib/network.js`, `functions/lib/handlers-trip.js`, `Tools/diagnose-naming-drift.js`):
  - **Discovery Mission**: De-coupled the engine from `topology.json`, restoring it as a pure learner that must "earn" its knowledge of the network through observation rather than reading from a hardcoded map.
  - **Temporal Deduction**: Surface routes (buses/streetcars) now learn adjacency by comparing trip durations. If A→C is 30m and A→B is 15m, the engine infers B precedes C and injects the B→C segment as an `inferred_temporal` edge.
  - **Canonical IDs**: Graph edges now store stable stop IDs and source metadata (`fromStopId`, `fromStopSource`, etc.) instead of relying on fragile display names.
  - **Weighted Confidence**: Upgraded the confidence model to factor in recency (decaying old edges) and source trust (preferring `verified` or `gtfs` stops over raw text).
  - **Drift Diagnostics**: New `Tools/diagnose-naming-drift.js` script to identify and clean up legacy naming inconsistencies in the historical graph data.
- **Geographic Prediction Constraints ("Menu-Based Filtering")** (`functions/lib/predict_v4.js`, `functions/lib/predict_v5.js`, `functions/lib/handlers-trip.js`):
  - **Hard Constraints**: ML models (V4/V5) are now restricted to a "Menu" of physically reachable stops provided by the Atlas and NetworkEngine before they make a guess. This eliminates "Hub Gravity" hallucinations where the model would guess popular destinations (like Spadina) even when they weren't on the current route.
- **TTC Surface Atlas Expansion** (`functions/lib/topology.json`): Added GTFS-verified stop sequences for major streetcar and bus trunks (510, 506, 505, 501, 511, 512, 504, 41) to serve as a high-fidelity prediction fallback and safety net.
- **End-stop legality telemetry + regression coverage** (`functions/lib/handlers-trip.js`, `functions/lib/predict_v4.js`, `functions/lib/predict_v5.js`, `functions/test_handlers.js`, `tests/predict.test.js`):
  - **Constraint source tracking**: Trip-start flows now record whether end-stop predictions were constrained by `network`, `topology`, or `none`, and log the legal-stop set size for auditability.
  - **Masked-top logging**: V4/V5 now log when the raw top ML destination is removed by the legality mask, making "physics beat popularity" interventions measurable in production.
  - **506 regression fixture**: Added rule-level tests proving a statistically dominant but illegal destination is excluded from the prediction menu for `506` from `College Station`, without any route-specific or stop-specific blacklist.
- **Transfer-complex reasoning + provisional journey hints** (`functions/lib/transfer-connections.js`, `functions/lib/transfer.js`, `functions/lib/handlers-trip.js`, `functions/test_transfer.js`, `functions/test_handlers.js`):
  - **Connected-stop library**: Added a curated transfer-complex layer for real TTC station handoffs, including `college`, `queen's park`, `spadina`, `union`, `king`, `dundas west`, `broadview`, `bathurst`, `main street`, `bloor-yonge`, `cedarvale`, `keelesdale`, `st george`, `lawrence west`, `sheppard-yonge`, and `osgoode`, so separate normalized stops can remain distinct records while still counting as one rider-meaningful transfer point.
  - **Provisional transfer detection at trip start**: New trips now score the most recent completed trip immediately and store lightweight provisional transfer metadata (`provisionalPrevTripId`, confidence) for real-time journey context, while final `journeyId` writes still happen conservatively at second-leg end.
  - **Connected-stop transfer matching**: `TransferEngine` stop-pair matching now accepts exact-stop matches or configured connected-stop pairs, fixing cases where adjacent surface/subway stops represent the same transfer complex in practice.
  - **Intersection-style connection pairs**: Added a second, narrower relationship layer for proven adjacent-stop handoffs like `College / Bay ↔ College Station`, `Spadina / Queens Quay ↔ Spadina / Queens Quay West`, and similar corner-to-corner TTC transfers without broadening station-complex groups.

### Fixed
- **Topology-covered routes now enforce a true legal downstream menu** (`functions/lib/predict.js`, `js/predict.js`, `tests/predict.test.js`): For covered route/boarding-stop/direction contexts, destinations outside the downstream stop sequence are now removed as physically impossible instead of being kept as "unknown." This closes the remaining loophole where a popular off-route stop like `Spadina Station` could survive alias drift and still win by historical weight on route `506`.
- **Topology alias matching normalized for slash/at variants** (`functions/lib/predict.js`, `functions/lib/predict_v4.js`, `functions/lib/predict_v5.js`, `js/predict.js`, `tests/predict.test.js`): Topology lookups now canonicalize stop names before matching, so rider text like `Spadina / College`, `College / Spadina`, and similar variants resolve to the same topology stop instead of silently disabling route constraints.
- **Journey linking can now bridge exact-stop boundaries inside a transfer complex** (`functions/lib/transfer.js`, `functions/lib/handlers-trip.js`, `functions/test_transfer.js`, `functions/test_handlers.js`): A `506` trip ending at the normalized surface stop outside `College Station` can now link correctly to a `Line 1` trip starting at `College Station`, without merging the two stops in the normalized stop library or changing displayed stop names.
- **Transfer matching now survives common TTC naming drift** (`functions/lib/transfer-connections.js`, `functions/test_transfer.js`): TransferEngine now canonicalizes a small set of observed stop-text variants and typos like `Keelsdale`, `Dundas/Sterlingp`, and `Dufferin&college`, and also handles intersection-order reversals like `Spadina / Harbord ↔ Harbord / Spadina` when matching transfer pairs.
- **SMS start-time preservation through stop/agency disambiguation** (`functions/lib/dispatcher.js`, `functions/lib/handlers-utils.js`, `functions/test_handlers.js`): Text trip starts now preserve the timestamp of the original inbound SMS even when the rider is prompted with follow-up clarification like `Which Bay?`. The provisional trip created during stop disambiguation now honors the original `startTime` instead of defaulting to the clarification reply time, preventing bogus `0 min` trips after short clarification loops.
- **Canonical stop names preserved in SMS replies** (`functions/lib/utils.js`, `tests/utils.test.js`): `getStopDisplay()` now uses matched `stopName` values from the normalized stop library as-is instead of re-running them through `toTitleCase()`. Fixes display regressions like `Bloor-Yonge Station` being degraded to `Bloor-yonge Station` after canonical lookup.
- **TransferEngine network hints actually wired through live trip-end flow** (`functions/lib/handlers-trip.js`, `functions/test_handlers.js`): `handleEndTrip()` now passes `NetworkEngine.getConnectionsAtStop()` into `TransferEngine.score()`, restoring the intended population-level transfer prior during auto-link decisions.
- **Transfer index feedback loop restored** (`functions/lib/handlers-trip.js`, `functions/test_handlers.js`): When a prior trip is identified as a transfer, `handleEndTrip()` now forwards `prevTrip.route` into `NetworkEngine.observe()`, allowing successful journey detections to populate `transferIndex` for future transfer suggestions and auto-link scoring.
- **Stop trust falls back to topology for covered routes** (`functions/lib/db/stops.js`, `tests/stops.test.js`): Stop resolution now checks the vetted normalized stop library first, then falls back to `topology.json` for route-covered subway/LRT stops before failing unresolved. This lets stops like `Davisville` on TTC Line 1 remain trusted for trip learning even when the normalized stop library is incomplete.

### Changed
- **Vetted TTC stop library expanded** (Firestore `stops` collection): Added `Davisville` as a manual TTC stop record so current Line 1 commute trips can resolve cleanly against the canonical stop library instead of falling through to unresolved raw text.

## [1.35.2] - 2026-05-12

### Fixed
- **Dependabot Alerts**: Resolved 8 high/moderate security vulnerabilities in `functions` by updating the `protobufjs` dependency tree to `7.5.8` via `npm audit fix`.

## [1.35.1] - 2026-05-12

### Fixed
- **CI Build Failure**: Removed `--omit=optional` from the root `npm install` command in GitHub Action workflows. Vite/Rolldown native bindings are installed as optional dependencies, and omitting them was causing `MODULE_NOT_FOUND` errors during the `npm run build` step.
- **SSRF CodeQL Alert**: Hardened MMS URL processing in `functions/lib/handlers-intelligence.js` by expanding the trusted Twilio domain whitelist, fully reconstructing target URLs to prevent bypasses, and ensuring guards and the `fetch` sink occur in the same try-block to resolve CodeQL alert #44.

## [1.35.0] - 2026-05-12

### Fixed
- **Next-leg suggestion displays original route label** (`functions/lib/network.js`, `functions/lib/handlers-trip.js`): Transfer index now stores `toLabels[connKey] = originalRoute` alongside counts. `getConnectionLabels()` retrieves them. Handlers-trip uses the original label for the "Usually take the X from here" SMS — fixing "510a" displaying instead of "510A", "greenline" instead of "Green Line", etc.
- **Anomaly detection uses destination-specific edge median** (`functions/lib/network.js`, `functions/lib/handlers-trip.js`): Added `getEdgeMedianDuration(graph, fromStop, toStop, hour)` to look up the specific A→C edge duration rather than aggregating across all edges leaving the boarding stop. Anomaly detection now calls this first and falls back to the aggregate only when no direct observation exists for the actual start→end pair. Prevents false positives on routes with diverse destinations (short ride to stop B vs. long ride to stop C from the same boarding stop).
- **SSRF guard restructured** (`functions/lib/handlers.js`): Merged the MMS URL validation and fetch into a single try block so the allowlist check directly guards the `fetch()` call. Also replaced an undefined `logger.warn` reference with `console.warn`, which was causing the two `handleMmsTrip` tests to fail with `ReferenceError`. Test URLs updated to use a trusted Twilio domain to match the validation.
- **Biased random in emoji picker** (`js/identity.js`): Replaced `Math.floor(randomUint32 / 0x100000000 * n)` with rejection sampling (`_randomIndex()`), eliminating the floating-point bias flagged by CodeQL alert #42. Bias was negligible in practice but the fix is correct and simple.
- **V4/V5 route grading normalization** (`functions/lib/handlers.js`): Route grading now normalizes both the predicted and actual route labels before comparing, matching the agency-aware normalization applied during ML training. Previously, a V5 prediction of `510` against an actual trip logged as `510A` always scored as a miss — grading compared raw labels, not normalized ones.
- **NetworkEngine mask uses MIN_TRIPS=2** (`functions/lib/network.js`): `getMask()` uses a lower confidence threshold (2 observations) than `filterCandidates()` (3 observations). Zeroing out ML probability mass is less risky than hard-filtering historical trip candidates, so the mask can act on sparser edge data.
- **NetworkEngine v1.3 — transitive reachability** (`functions/lib/network.js`): `getMask()` and `filterCandidates()` now augment the graph with inferred A→C edges derived from A→B + B→C pairs in the same direction before computing reachability. Inferred edges are single-hop only (no chaining through other inferred edges) and never overwrite observed edges. `tripCount = min(count1, count2)`, `medianMinutes = median1 + median2`. This makes any stop reachable via a learned intermediate stop available for prediction filtering after fewer real trips to that endpoint. 7 new tests.
- **NetworkEngine wired into V4/V5 end stop prediction** (`functions/lib/network.js`, `functions/lib/predict_v4.js`, `functions/lib/predict_v5.js`, `functions/lib/handlers.js`): V4/V5 end stop predictions now filter impossible stops via NetworkEngine before falling back to topology.json — the same priority order V3 uses. Previously topology.json only covered subway lines (1, 2, 4, 5), so surface route predictions (e.g. 510 streetcar) had no impossibility filter, causing the model to over-predict dominant destinations like Spadina & Nassau regardless of direction or boarding stop.

### Added
- **Habit change detection** (`functions/lib/habit.js`): `rebuild()` now detects when a different route/direction is emerging in the same (stop, day, 2-hour bucket) slot within the last 30 days. Old habits with a newer replacement pattern are marked `stale: true` with a `replacedBy` field. Stale habits are filtered out by `match()` so they stop firing immediately. 3 new tests.
- **Trip start reply formatting** (`functions/lib/handlers-utils.js`): Tightened `getPredictionPrompt` — removed "FORGOT if you forgot to end" and "INFO for help" from all cases, removed "Reply" prefix, split single-prediction reply into three clean paragraphs (start confirmation / destination guess / END instruction).
- **Anomaly detection** (`functions/lib/handlers-trip.js`): END reply now flags trips that took 2× or more the hour-specific median — "This trip took longer than usual (40 min vs. typical 10 min)." Uses the NetworkEngine hour-slot median for the trip's start hour. Suppressed for short typical trips (median < 5 min) to avoid noise. 2 new tests.
- **NetworkEngine v1.2 — hour-slot travel time buckets** (`functions/lib/network.js`): `observe()` now writes trip durations into `durationsByHour[hour]` on each edge alongside the existing flat pool. `getMedianDuration()` accepts an optional `hour` parameter and uses the hour-specific bucket when it has ≥3 observations, falling back to the aggregate when sparse. Staleness detection in `determineStaleness` now passes the current hour so rush-hour and off-peak trips are compared against the right baseline. 5 new tests.
- **Next-leg suggestion** (`functions/lib/handlers-trip.js`): END reply now surfaces the most likely next route when the alighting stop is a known transfer point — "Usually take the 2 from here." Feeds from the NetworkEngine transfer index (min 2 observed connections). Suppressed when the trip is already auto-linked as part of a journey. 2 new tests.
- **HabitEngine v1.0 + habit-first pipeline** (`functions/lib/habit.js`, `functions/lib/handlers-trip.js`, `functions/test_habit.js`): New engine that learns recurring trip patterns from history. Groups completed trips by (stop, route, direction, day-of-week, 2-hour bucket) and scores each group — count × recency decay (30-day half-life) × time-window precision. When a habit fires (confidence ≥ 0.75, route/direction match), V3/V4/V5 inference is skipped entirely and the SMS reply surfaces the known destination: "Usual trip to Spadina Station." `HabitEngine.match()` accepts optional route/direction filters so a 510 habit doesn't fire when the user boards the 29. Habit end stop predictions are graded at trip end (tracked in `predictionAccuracy`). Habits are rebuilt in the background after every trip end. 37 tests. 149/149 passing.
- **`handlers.js` split into focused modules** (`functions/lib/handlers-*.js`): Split the 1712-line file into five focused siblings — `handlers-utils.js` (10 shared helpers), `handlers-commands.js` (7 simple SMS commands), `handlers-trip.js` (4 trip lifecycle handlers), `handlers-query.js` (3 stats/journey handlers), `handlers-intelligence.js` (MMS + fill predictions). `handlers.js` is now a thin barrel re-export. All 145 tests pass.
- **NetworkEngine v1.1 — route-stop + transfer indexes** (`functions/lib/network.js`, `functions/lib/handlers.js`): `observe()` now writes two new Firestore collections alongside the edge graph. `routeStopIndex` tracks which routes serve each stop (board + alight counts). `transferIndex` tracks which route pairs connect at each boarding stop, populated when a trip has a `prevRoute`. Both are queryable via `getRoutesAtStop()` and `getConnectionsAtStop()`. Indexes build automatically from future trips — no backfill needed.
- **TransferEngine v1.1 — NetworkEngine possibility signal** (`functions/lib/transfer.js`, `functions/lib/handlers.js`): Transfer scoring now uses the NetworkEngine transfer index as a population-level prior when no personal history matches. A known route pair connection at the boarding stop pushes no-pattern confidence above the link threshold for short gaps (≤ 10 min) and extends the cold-start window from 15 → 20 min. Gets smarter as the index grows.
- **Prediction stats analysis script** (`ml/analyze_predictions.py`): Reports hit rates by model version, top confusion pairs, confidence calibration, and high-confidence misses from live `predictionStats` data.
- **Trip count diagnostic** (`ml/count_trips.py`): Breaks down total Firestore trip count by export-filter category to understand how many trips are excluded from ML training and why.
- **V5.2/V5.3 grade backfill** (`ml/backfill_v5_grades.py`): One-time script to correct `isHit` values for V5.2/V5.3 prediction records that were mis-graded due to the normalization bug above. Also corrects the corresponding `predictionAccuracy` running counters.

## [1.34.1] - 2026-05-11

### Security
- **SSRF fix**: Validate `mediaUrl` against trusted Twilio domains (`api.twilio.com`, `media.twiliocdn.com`, `mms.twilio.com`) before fetching MMS images — prevents server-side request forgery via crafted webhook payloads.
- **ReDoS fixes**: Capped unbounded `.+` in SMS parsing regexes to `.{1,160}` (SMS max length) and made route-matching alternatives mutually exclusive to eliminate polynomial backtracking.
- **SRI hashes**: Added `integrity` + `crossorigin` attributes to Leaflet and Lucide CDN script tags in `v2.html` and `v2-home.html`; pinned Lucide to `1.14.0` (was `@latest`).
- **Secure randomness**: Replaced `Math.random()` with `crypto.getRandomValues()` in `identity.js` username slug generation.

## [1.34.0] - 2026-05-09

### Fixed
- **Multiline SMS field-order parsing** (`functions/lib/parsing.js`, `tests/parsing.test.js`): Multi-line trip logs now support both `route / stop / direction` and `route / direction / stop`, fixing cases like `506 / West / College / Spadina` that were previously misparsed with the direction stored as the stop.
- **Explicit `START` multiline parsing** (`functions/lib/parsing.js`, `functions/lib/dispatcher.js`): Messages like `START / 2 / Kipling / West` now parse as real trip starts instead of falling through to `sms_fallback`.
- **Casual trip-start phrasing** (`functions/lib/parsing.js`, `functions/lib/dispatcher.js`): Added deterministic parsing for sentence-style starts like `I'm on the 510 from Spadina and Nassau`.
- **Live route day-of-week features** (`functions/lib/predict_v4.js`, `functions/lib/predict_v5.js`): Fixed a bug in live V4/V5 route inference where `day_cos` was derived from `day_sin` instead of the actual day index, which skewed day-of-week feature encoding at prediction time.

### Changed
- **Trip stop-text preservation**: Corrected a live trip record to preserve the rider-entered stop text `College / Spadina` while still mapping it to verified TTC stop `844` (`College St at Spadina Ave`), reinforcing the rule that trip records should retain rider wording rather than overwriting it with the official stop name.
- **Trip stop-match semantics** (`functions/lib/handlers.js`, `functions/lib/dispatcher.js`): Renamed the automatic stop-resolution flag from `verified` to `stop_matched` for new writes, while keeping backward-compatible reads from older trip records.
- **ML history filtering** (`functions/lib/db/trips.js`, `ml/export_trips.py`): Live prediction history and training exports now exclude trips that are incomplete, discarded, marked `needs_review`, or missing a confirmed stop match (`stop_matched`, with fallback support for older `verified` records).
- **Manual verification signal** (`js/trips/TripController.js`, `ml/export_trips.py`): Review confirmation now stamps trips with `manually_verified: true`, and training exports carry that field so hand-reviewed trips can be identified downstream.
- **ML route normalization** (`ml/route_normalization.py`, `ml/train_routes.py`, `ml/train_endstop.py`, `ml/calibrate_v4.py`): Added a shared agency-aware route normalization helper so TTC branch, shuttle, and short-turn labels collapse into their base route family for ML, while non-TTC labels like `Red`, `K`, and `N` retain their distinct identities.
- **End-stop sequence features** (`ml/export_trips.py`, `ml/train_endstop.py`, `functions/lib/ml_utils.js`, `functions/lib/predict_v4.js`, `functions/lib/predict_v5.js`, `functions/lib/handlers.js`): Added `prev_route` and trip-gap features to the end-stop training pipeline and live candidate-evaluation path so V4/V5 can use basic journey context rather than treating each trip start as fully isolated.
- **Line 5 station normalization** (`Tools/create-normalized-stops.js`): Promoted `Keelesdale` to `Keelesdale Station` with proper aliases and Line 5 routing, and aligned Cedarvale station metadata to include Line 5 service in the normalized stop library.
- **Trip coordinate writes deprecated** (`functions/lib/handlers.js`, `functions/lib/dispatcher.js`): New trip writes no longer copy `boardingLocation` or `exitLocation` coordinates onto trip records; canonical stop geometry now lives in the normalized stop library, with read-side fallbacks left intact.
- **Multi-agency route validation** (`functions/lib/utils.js`): Route validation now accepts legitimate named/non-TTC route labels like `Orange`, `Green Line`, `Pacific Surfliner`, and `Flagship Cruises & Events` instead of incorrectly flagging them for review.
- **Review/audit tooling** (`Tools/*.js`): Added reusable scripts for duplicate manual-verification candidates, candidate-prediction audits, route-review cleanup, trip-context inspection, and review-queue triage.
- **Fallback recovery policy**: Confirmed `sms_fallback` records with clear trip-start text can be backfilled into real trip starts while preserving the original `raw_text`.

## [1.33.0] - 2026-05-07

### Fixed
- **AI Stats Timezone Regression** (`functions/lib/gemini.js`): Fixed a `ReferenceError: timezone is not defined` that broke aggregate stats for ASK queries.
- **Journey Linking Logic** (`functions/lib/handlers.js`): Fixed an undefined `thisStartTime` variable that prevented automated journey linking at trip end.
- **Restored Organic Agency Expansion** (`functions/lib/parsing.js`): Corrected a regression to allow unknown agencies on Line 3 of multi-line SMS messages, ensuring the system can learn new agencies organically.

### Changed
- **Dependency Modernization**: Manually updated `eslint`, `twilio`, `globals`, and `jsdom` to their latest versions, satisfying multiple Dependabot security and maintenance alerts.

## [1.32.0] - 2026-05-07

### Added
- **"Likely Ended" Trip Intelligence** (`functions/lib/handlers.js`, `functions/lib/network.js`): Replaced the blunt 6-hour active trip cutoff with route-aware logic using historical median durations from the NetworkEngine.
- **V3 Sequence Awareness** (`functions/lib/predict.js`): Upgraded the hand-coded V3 heuristic engine to use the `last_end_stop` signal, significantly boosting transfer prediction accuracy.
- **User-based Visibility (Master Switch)** (`js/profile.js`): Toggling the public profile in Settings now automatically syncs the visibility state across all existing and new trips via a batch update.
- **Map-First Public Profile** (`public.html`, `js/public.js`): Redesigned the public profile as a full-screen, high-impact dark heatmap experience.
- **Triple Emoji Identity system** (`js/identity.js`, `js/profile.js`): Launched a visual triplet handle system (e.g., 🚌🌮🐼) with unique constraints and an interactive picker in Settings.
- **Stop library caching** (`js/trips.js`): Implemented 24-hour `localStorage` caching for the stops library to reduce Firestore reads.
- **Node 22 parallel testing** (`functions/package.json`): Modernized the backend test suite to use the native Node test runner.
- **Automated Coordinate Backfill**: Implemented a fuzzy-matching script to assign coordinates to manual stop entries, tagged with `source: 'automated_backfill'`.

### Fixed
- **ML Stop Blindness**: Fixed a major bug where V4 and V5 models were blind to stop aliases; all data is now passed through `stopsLibrary` canonicalization.
- **ML Sequence Amnesia**: Upgraded V4 and V5 to use the `last_end_stop` feature to understand transfers and journey context.
- **ML Route/End-Stop Mismatch**: Separated the training pipelines so models are properly trained for their specific candidate-evaluation tasks.
- **SMS Acronym Preservation**: Updated `toTitleCase` to respect capitalization for transit acronyms (TMU, TTC, GO).
- **SMS Stop Name Prioritization**: Confirmation replies now prefer canonical stop names over numeric codes.

### Changed
- **Documentation synchronized**: Updated all core guides including [README.md](./README.md), [ROADMAP_TECHNICAL.md](./docs/ROADMAP_TECHNICAL.md), [ROADMAP_NEXTGEN.md](./docs/ROADMAP_NEXTGEN.md), [CLAUDE.md](./CLAUDE.md), and [AGENTS.md](./AGENTS.md).
- **Legacy Cleanup**: Deleted the deprecated `js/main.js` entry point.
- **Agency mapping pruned**: Removed speculative timezone/city data for unused agencies to maintain a lean resource profile.

## [1.31.0] - 2026-05-05

### Added
- **Public profile page wired end to end**: Added a real routed public profile page, public username lookup, and a shareable `/public?user=...` flow.
- **Regression test coverage**: Added focused tests for END retry dedup, MMS Snap-to-Start dispatch, and timing metadata propagation.

### Changed
- **SMS flow internals refactored**: Split pending-state handling into focused helpers and decomposed `handleTripLog` for maintainability.

### Fixed
- **Gemini stats bucketing**: Gemini stats now bucket dates in the requested timezone rather than server-local time.

## [1.30.0] - 2026-05-05

---

See also: [Documents Index](./DOCUMENTS.md)
