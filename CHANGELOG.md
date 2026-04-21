# Changelog

All notable changes to this project will be documented in this file.

**See also:** [Prediction Engine history](docs/ENGINE.md) · [Transfer Engine history](docs/TRANSFER_ENGINE.md) · [Network Engine history](docs/NETWORK_ENGINE.md) · [NextGen Roadmap](docs/ROADMAP_NEXTGEN.md) · [Technical Roadmap](docs/ROADMAP_TECHNICAL.md)

## [Unreleased]

### Fixed
- **Null startStopName/endStopName on 10 510-route trips**: Trips logged before stop name persistence was reliable had null name fields despite valid stop codes. Backfilled GTFS names from `startStopCode`/`endStopCode` directly in Firestore. Affected trips tagged with `corrected: ['startStopName']` or `corrected: ['endStopName']` for auditability.

## [1.25.0] - 2026-04-20

### Added
- **Autonomous weekly model retraining** (`.github/workflows/retrain.yml`): GitHub Action fires every Monday at 4 AM UTC. Exports fresh trips from Firestore, retrains V4 (logistic regression) and V5 (XGBoost) with ride-count weighting, commits updated model files, and deploys functions to Firebase — no manual steps needed. Also triggerable manually via GitHub UI. Requires `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_TOKEN` secrets.
- **Ride-count weighting in V4/V5 training** (`ml/train_endstop.py`): Training examples are now weighted by same-agency ride count — recent trips count more in the loss function. Mirrors V3's per-agency ride-count decay. A trip 100 same-agency rides ago gets half the weight of the most recent trip.

- **LA Metro G Line (Orange) and J Line (Silver) added to topology** (`functions/lib/topology.json`): Both BRT lines now have full stop sequences. G Line: 17 stops, North Hollywood → Chatsworth. J Line: 13 key stops, El Monte → Harbor Gateway Transit Center via Union Station and the Harbor Transitway. Enables direction filtering from the first trip on either line.

### Changed
- **V3 recency decay now per-agency ride count, not calendar time** (v3.3.0): Previously, trip weights decayed by days elapsed — so a week in LA decayed TTC predictions even though Toronto commute patterns hadn't changed. Now decay is measured by how many same-agency rides occurred after each trip. A trip 100 same-agency rides ago counts for half what the most recent trip counts for (configurable via `DECAY_HALFLIFE_RIDES`). Being in a different city no longer ages your home network's predictions.

### Fixed
- **All SMS replies silently dropped** (`sms.js`): The idempotency fix in b385882 added a `processedMessages/{MessageSid}` write to `sms.js` before calling `dispatch()`. But `checkIdempotency()` in the dispatcher already does the same atomic write — so every message's write succeeded in `sms.js`, then `checkIdempotency` got `ALREADY_EXISTS` and returned `true` (duplicate), dropping every message with no reply. Fixed by removing the redundant write from `sms.js`. The dispatcher's `checkIdempotency` is the single source of truth for deduplication.
- **Twilio webhook retry creates duplicate trips**: When the Cloud Function took too long to respond, Twilio retried the webhook and the system processed the same message twice — creating phantom trips with garbled stop names. Fixed by atomically writing a `processedMessages/{MessageSid}` document before dispatching. If the document already exists (Firestore `create` throws ALREADY_EXISTS), the request is a retry and returns an empty TwiML response immediately.

## [1.24.0] - 2026-04-20

### Added
- **NetworkEngine v1** (`functions/lib/network.js`): New prediction engine that learns the transit graph from completed trips. Each trip end records an edge `fromStop → toStop` with duration to Firestore (`networkGraph` collection). At trip start, the graph for the current route is loaded and used as a higher-priority directional filter than topology.json — so any network (BART, Muni, LA Metro, future cities) builds itself automatically without manual stop-sequence curation. Falls back to topology.json when fewer than 3 trips have been observed on an edge. Reverse-edge inference: a B→A westbound trip also confirms A is reachable from B eastbound.
- **Network graph backfill script** (`Tools/backfill-network-graph.js`): One-time script to seed the graph from all existing trips so NetworkEngine has data immediately on deploy.
- **Route-aware stop disambiguation**: When a stop name matches multiple library entries, candidates are filtered by the trip's route before prompting. If only one candidate serves that route, it is selected automatically with no user prompt. If multiple candidates serve the route, only those are shown — narrowing the list. Falls back to all candidates when no route data exists yet for any match.
- **Stop route back-write**: Every time a trip start resolves a stop successfully, the route is written to the stop's `routes` array in the background. Stops learn which routes serve them automatically over time — no manual maintenance needed.

### Changed
- **Stop disambiguation starts trip immediately**: When a stop name is ambiguous and there is no active trip conflict, the trip now starts at send time with the raw stop name stored temporarily. The user is sent "510 started. Multiple stops match...: Reply with a number to set your stop, or DISCARD to cancel." Replying with a number updates the trip's stop fields to the canonical name and code; DISCARD deletes the trip. If the user never replies, the trip is preserved for duration/time-on-transit stats but excluded from origin stop stats (same outcome as FORGOT). Previously the trip did not start until disambiguation resolved, causing incorrect boarding times.
- **STATS "Top route" moved to its own line and reworded**: Was appended inline to the 30-day line as "· Most ridden: 1 (39×)". Now appears as a separate paragraph: "Top route: 1 (39×)".

### Fixed
- **End-stop predictions bleed across directions on topology-covered lines (V3)**: `_preFilterCandidatesByTopology` and `_applyTopologyFilter` fell back to the full unfiltered candidate set when the topology filter produced zero results — so going eastbound from Spadina on Route 2 showed westbound stops (Dufferin, Lansdowne) because all historical trips from that stop were westbound. The fallback now only triggers when topology *can't* be applied (route or boarding stop not found in topology). When topology fully covers the route and direction, an empty filtered set is returned as-is, which correctly yields no prediction rather than wrong-direction predictions.
- **Line 1 direction filter incorrectly applied at Union Station**: Boarding at Union treated it as a Yonge-branch stop, causing northbound trips to filter toward lower indexes (back up Yonge) instead of allowing University-branch end stops. Union is now exempt from topology filtering in both `_preFilterCandidatesByTopology` and `_applyTopologyFilter` — either branch is valid from there, so historical data is left unfiltered.
- **Disambiguation start message showed "Unknown" during pending window**: When a trip was created during stop disambiguation, startStopName was written as null — so STATUS during the pending window showed "Active trip: 1 Northbound from Unknown". Now writes the raw stop name the user typed as a temporary placeholder until disambiguation resolves.

## [1.23.0] - 2026-04-16

### Added
- **Ambiguous stop disambiguation**: When a stop name matches multiple entries in the stops library, the system now asks "Multiple stops match '[name]': 1. X 2. Y — Reply with a number or DISCARD to cancel." User picks a number, trip proceeds with the unambiguous stop code. Previously, the first result was picked silently. Mirrors the existing `confirm_agency` flow — stored in `smsState` as `confirm_stop`, resolved in the dispatcher.
- **Up Valley / Down Valley directions**: Gemini SMS parser now recognizes and normalizes "Up Valley" and "Down Valley" directions (alongside Inbound, Outbound, Clockwise, Counterclockwise) — previously the prompt only listed the four cardinal directions, so natural-language messages with these directions would pass through unnormalized.
- **Agency inference from last trip**: When no agency is specified, the system checks the most recent trip's agency. If it differs from the profile default, it uses that agency instead — so trips in a non-home city work automatically without adding an agency line every time. If the stop is found in both the inferred and default agency's library (ambiguous), the user is asked "Which [stop]? 1. [last agency] 2. [default agency]" and replies with a number. This also handles the return-home case: the first TTC trip after travelling asks once, then resets automatically.

### Fixed
- **V4 and V5 accuracy not rolled up**: Route and end stop predictions from V4/V5 were written to `predictionStats` (individual records) but never incremented the `predictionAccuracy` summary doc — so V4/V5 accuracy was invisible without a full collection scan. Each grading block now updates `v4Total/v4Hits/v4PartialHits`, `v5Total/v5Hits/v5PartialHits`, `v4EndStopTotal/v4EndStopHits`, and `v5EndStopTotal/v5EndStopHits` alongside V3's existing counters.
- **Named route stored with uppercased direction word**: Routes like "Lakeshore West" or "Lakeshore East" were stored as "Lakeshore WEST" / "Lakeshore EAST" because `normalizeRoute` uppercased any trailing letter sequence, which was designed for numeric suffixes like `510a → 510A`. Fixed by skipping the suffix logic for routes that don't start with a digit.
- **Trip start crash gives no user feedback**: If `createTrip` threw (e.g. a Firestore write error), the exception propagated to the top-level handler which returned HTTP 500 — the user received no reply and had no way to retry. Added try/catch in `handleTripLog` so the user gets "Could not start your trip. Please try again." instead of silence. Same pattern as the `handleEndTrip` fix in 1.21.1.
- **Twilio failure after trip creation swallowed silently**: If `sendSmsReply` threw after `createTrip` succeeded, the exception propagated and the trip was written but the user received no confirmation. The trip now logs the Twilio failure and continues — the trip is preserved and will appear as active on next STATUS.

## [1.22.1] - 2026-04-15

### Changed
- **STATS response rewritten**: More conversational format. Shows past 7 days, current month by name, and 30-day summary with time on transit. Adds "Most ridden: [route] (N×)" line showing top route for the period.

## [1.22.0] - 2026-04-16

### Added
- **Single-line trip start format**: "510 Spadina/College North" now works as an alternative to multi-line format. Direction must be the last word; stop is everything in between. Parsed by new `parseSingleLineTripFormat` in `parsing.js`.
- **UNLINK command**: Removes the journey link from the most recently ended trip. Strips `journeyId` from all trips in the journey. End-trip confirmations now include "UNLINK to separate." when a link is made.
- **TransferEngine** (`lib/transfer.js`): Replaces the hardcoded 60-minute journey linking threshold. Learns from historical journeys (trips sharing a `journeyId`) to score transfer confidence based on stop pair match, route pair match, gap time vs historical average, and time-of-day similarity. Cold start fallback: links only if gap ≤ 15 minutes when no history exists. Threshold: 0.55 confidence.
- **Transfer test suite**: `test_transfer.js` — 15 tests covering `extractTransfers`, `score`, and `_stopMatch`. Includes regression test for tonight's false-positive 31-minute link.
- **Parser test suite**: `test_parsing.js` — 27 tests covering `parseMultiLineTripFormat`, `parseSingleLineTripFormat`, `parseEndTripFormat`, and `isHeuristicLogValid`. Run all tests with `npm test`.
- **Cloud Logging access**: Added Logs Viewer role to the Firebase Admin SDK service account for direct error log queries.

### Fixed
- **End trip crash when stop has no coordinates**: `lookupStop` can return a stop document missing `lat`/`lng`. Building `exitLocation: { lat: undefined, lng: undefined }` caused Firestore to reject the update with "Cannot use undefined as a Firestore value", silently failing the end-trip command with no user feedback. Fixed by guarding both `exitLocation` and `boardingLocation` — only written if both coordinates are non-null. Same fix applied to start trips (`boardingLocation`).
- **Stops missing lat/lng**: Backfilled coordinates for 10 Spadina-area stops by matching GTFS `stop_id` to Firestore stop codes. All 10 were Spadina/College and Spadina/Queen-area streetcar stops.

### Changed
- **`db.js` split into domain modules**: `lib/db.js` is now a backward-compatible shim. Logic lives in `lib/db/` — `core.js`, `rate-limit.js`, `users.js`, `trips.js`, `stops.js`, `conversations.js`. All existing imports continue to work unchanged.

## [1.21.1] - 2026-04-15

### Fixed
- **END command blocked by content duplicate check**: The 60-second content dedup window was silently dropping END/STOP retry attempts. If an end-trip command failed for any reason, the user couldn't retry for 60 seconds and received no feedback. END/STOP commands now bypass the duplicate check entirely.
- **"Fucking end the trip" and similar AI-parsed END intents silently did nothing**: When Gemini classified a message as END_TRIP but extracted no stop name, the handler skipped calling `handleEndTrip` and sent no reply — the trip wasn't ended and the user was ghosted. Now always calls `handleEndTrip` (with null stop if none extracted), consistent with sending bare "END".
- **Unhandled exception in `handleEndTrip` caused 500 with no user feedback**: If a Firestore error occurred during the trip-end write, the exception propagated to the top-level handler which returned HTTP 500. The user received no reply and subsequent retries were blocked by content dedup. Added try/catch in `handleTripFlow` so the user gets "Could not end your trip. Please try again." instead of silence.
- **STATUS showed UTC time instead of local time**: `toLocaleTimeString` called without a `timeZone` option defaults to the Cloud Functions server timezone (UTC). STATUS now passes the agency's IANA timezone (e.g. `America/Toronto`) so the displayed time matches the user's local clock.

## [1.21.0] - 2026-04-15

### Fixed
- **"Start [Route] [Stop]" not recognized**: Messages beginning with "START " (e.g. "Start 2 Spadina West") were passed to Gemini with the prefix intact, which confused intent parsing. The prefix is now stripped before trip flow and AI handling so it works identically to sending the trip without it.
- **Stop names with leading parentheses lose capitalization**: `toTitleCase` called `.charAt(0).toUpperCase()` on each word-part, but a leading `(` is not a letter so the actual first letter stayed lowercase (e.g. `(laird` instead of `(Laird`). Fixed by using a regex that skips leading non-letter characters before capitalizing.
- **ASK "which trips today?" only returned a count**: `get_trips_for_date` returned `{ date, count }` with no trip details. Added `get_trip_details_for_date` tool that returns route, direction, from/to stops, and time for each trip. Updated `get_trips_for_date` description to steer Gemini toward the right tool based on intent.

### Changed
- **STATS format**: Replaced terse labels (`7d`, `30d`, `MTD`) with plain English (`Past 7 days`, `Past 30 days`, `This month`).
- **INFO personalised by tier**: Non-premium users no longer see the ASK command in the INFO response. Premium users see it without the "(premium)" qualifier since it's already known to them. REGISTER removed from INFO entirely.
- **Agency shown in trip confirmations for non-default agencies**: Start and end confirmation messages now append " via [Agency]" when the trip's agency differs from the user's profile default (e.g. "Started 5 Westbound from 3174 (Laird / Ridgeway) via Oakville Transit.").
- **Timezone-correct date bounds for ASK queries**: `get_trips_for_date`, `get_trips_for_date_range`, and `get_trip_details_for_date` now compute day start/end as UTC timestamps anchored to the user's local timezone using a DST-safe noon reference point, instead of treating date strings as UTC. Fixes off-by-one-day issues for trips near midnight in non-UTC timezones.
- **Gemini intent parser now extracts agency**: Added `agency` field to the Gemini SMS parsing prompt, schema, and sanitizer. AI-parsed trips (the fallback path) now use the extracted and normalized agency instead of always defaulting to the user's profile default. Fixes trips logged via natural language in non-default cities being stored with the wrong agency.
- **Agency timezone auto-discovery**: New `lookupAgencyTimezone(agency)` function checks a hardcoded map of known agencies first, then a Firestore `agencyTimezones` cache, then asks Gemini for unknown agencies and caches the result permanently. ASK queries now derive timezone from the most recent trip's agency automatically — no manual profile updates needed when travelling. LA/SF agencies (LA Metro, BART, Muni, AC Transit, Caltrain, etc.) pre-seeded.
- **Agency name canonicalization**: Added `AGENCY_CANONICAL` map and `normalizeAgency()` util. All agency names are normalized to a canonical form at parse time — "Toronto Transit Commission", "toronto transit commission", and "TTC" all store as "TTC". Applies to multi-line SMS parser, agency override parser, and AI-parsed trips. Prevents stat fragmentation from alias variations.
- **LA/SF agencies added to `KNOWN_AGENCIES`**: LA Metro, LAMETRO, BART, Muni, SFMUNI, SFMTA, AC Transit, ACTRANSIT, Caltrain, VTA, SamTrans, LADOT, Big Blue Bus now recognized by the deterministic SMS parser.
- **Timezone-aware ASK queries**: `aggregateTripStats` and `answerQueryWithGemini` now accept a `timezone` parameter. Timezone is derived automatically from the most recent trip's agency via `lookupAgencyTimezone` — no manual configuration needed when travelling.
- **`activeTrip.agency` no longer falls back to `'TTC'`**: Changed to `null` to avoid silently misattributing trips from other agencies.
- **V4/V5 end stop predictions now collected and graded**: Both ML engines previously had `guessTopEndStops` implemented but never called. Top-1 end stop predictions from V4 (logistic regression) and V5 (XGBoost) are now stored on each trip doc at start time and graded against the actual exit stop at trip end, feeding `predictionStats` with version-tagged end stop accuracy data.

## [1.20.11] - 2026-04-15

### Fixed
- **Login Continue button blocked by map overlay**: `.auth-card` was missing `position: relative`, so its `z-index` was ignored. The decorative `.auth-map-bg` (position: absolute, covering the full view) sat on top and swallowed all pointer events. Fixed by adding `position: relative` to `.auth-card` and `pointer-events: none` to `.auth-map-bg`.

## [1.20.10] - 2026-04-15

### Changed
- **CSS Modular Refactoring**: Extracted the monolithic 1770-line `main.css` into 11 specialized style modules (`styles/core/`, `styles/components/`, `styles/pages/`). `main.css` is now a pure `@import` manifest, dramatically improving maintainability and isolating page-specific UI code without altering any underlying layout logic.
- **Header logo left-justified**: Switched header layout from CSS grid to flexbox — logo is now flush left instead of centered in a `1fr` column. Nav items follow directly; settings gear stays right.
- **Nav item visibility**: Stops and Users nav items now show for all users, not just admins. Rocket remains admin-only.
- **Trip Data Immutability Guarantee**: Completely severed write access to telemetry trip strings from the Triage Link cycle. Trips are no longer mutated upon classification; instead, linking natively leverages pure Stop Library pointer aliases, ensuring absolute source-of-truth integrity for 100% of collected data records.
- **Admin Controller cleanup**: Excised 200 lines of orphaned, legacy GTFS parsing code from the bottom of `admin.js`. This code was fully deprecated during the 1.19.0 MPA architectural overhaul. `admin.js` is now a dedicated, cohesive 450-line view controller.
- **Admin Inbox redesign**: Unrecognized stops are now grouped by stop name with collapsible accordion headers. Click a group to expand and see individual trip rows (route, direction, boarding/exit, date). "Accept All" button batch-links every trip in a group at once. Removed the garish orange left-border bar.
- **Stop card density**: Library stop cards are significantly more compact — reduced padding, smaller grid min-width (280px → 220px), tighter alias pills. Fits more stops on screen.
- **Triage column widened**: Sidebar increased from 300px to 360px to give grouped inbox items room to breathe.

## [1.20.9] - 2026-04-13

### Fixed
- **Auth logout on page load**: `checkWhitelist` now retries once on Firestore error before returning `allowed: false`. A transient network error on page load was immediately signing out authenticated users.

## [1.20.8] - 2026-04-14

### Added
- **V4.1 / V5.1 end stop prediction**: Both shadow models now predict end stops (`guessTopEndStops`), not just route. Trained separate classifiers on 114 trips (11 end stop classes). V4.1: 39% top-1 / 87% top-3. V5.1: 48% top-1 / 96% top-3.
- **Topology pre-filter for V4.1 / V5.1**: Impossible end stops zeroed out before softmax/probability read — model never scores stops that can't be reached from the boarding stop in the given direction.

### Changed
- **V3 topology filter moved upstream (v3.1.1)**: Candidate trips pre-filtered by topology before voting — impossible destinations eliminated before scoring, not after. Cleaner and more correct.
- **Engine versions**: V3 → 3.1.1, V4 → 4.1, V5 → 5.1.

## [1.20.7] - 2026-04-13

### Added
- **Topology constraint filter**: Post-inference directional filter on end stop predictions. Lines 1, 2, 4, 5 (TTC), LA Metro B/D/A/E, BART, Muni N/T. Boarding eastbound on Line 2 at Spadina can't exit at Kipling — impossible candidates are zeroed out before the top-3 is returned. Falls back silently if route or stop not in topology.
- **Route alias resolution**: Route strings like "Line 1", "Red Line", "N Judah" now resolve to the correct topology entry — no exact key match required.
- **Cross-city topology**: LA Metro (B/D/A/E lines) and SF (BART trunk, Muni N Judah, Muni T Third) added to `topology.json`. Filter activates automatically when trips are logged on those networks.

### Changed
- **Stop canonicalization in topology filter**: Stop names are resolved through the stops library before topology index lookup — no need to maintain duplicate alias lists in both places.

## [1.20.6] - 2026-04-13

### Added
- **Settings full page** (`/settings`): Settings is now a dedicated page instead of a modal. Account, Preferences, and admin Prediction Accuracy sections. Gear icon in header links there.
- **Stop route + direction inheritance**: When a trip is linked to a stop, the stop automatically inherits the trip's route and direction — so future trips on the same route auto-match without manual work.

### Fixed
- **Admin Inbox always empty (real fix)**: Was reading `window.Trips.allTrips` which doesn't exist — trips live on `TripController.allTrips`. Now reads the correct source.
- **Stop aliases not editable**: Stop edit modal now shows existing aliases as removable pills, with an add field. Aliases are saved/updated on every stop save.
- **Map page crash/freeze**: `map.js` was passing `Trips.allTrips` (undefined) to `MapEngine.init()` — Leaflet crashed when trying to iterate undefined, hanging the tab. Now passes `TripController.allTrips`.
- **Insights stuck at "Analyzing riding patterns..."**: `Stats.computeHighlights()` existed but was never called. Now renders commute highlights into the Insights page.
- **"Create New Stop" button did nothing**: Button existed in the Link Stop modal but had no listener. Now opens the stop form pre-filled with the raw stop string.
- **Users page "Failed to load users"**: Profile and phone queries were bundled in `Promise.all` — a phone number permission error killed the whole page. Now loads profiles independently; phone numbers are a best-effort bonus.
- **Beta toggle did nothing**: `settings-beta-predictions` saved to Firestore but `PredictionView` never checked it. Moot now that the prediction card is removed.

### Changed
- **Prediction card removed**: Dashboard prediction card removed. Predictions still run via SMS (3 predicted end stops). The card was redundant.
- **Admin Inbox rebuilt**: Now shows individual trips with unrecognized stops instead of grouped raw strings. Each trip shows route, direction, boarding/exit role, and date. Linking a trip updates that trip directly, adds the raw string as an alias, and adds route + direction to the stop — so the same variant never appears again.
- **Inbox density**: Tighter padding and spacing — usable with 150+ items.
- **Header**: Settings gear icon is now a link, not a button. No modal injected into DOM.
- **Map overlay removed**: Memomaps transit overlay removed (CSP was blocking every tile request, freezing the page).

## [1.20.5] - 2026-04-13

### Fixed
- **Trip feed limited to 20**: Feed now loads 20 trips with a "Show more" button that loads the next 20. Count persists across live updates.
- **Prediction card jargon**: Replaced "Anticipated Deployment", "Active Telemetry Prediction", "Unmapped Vector", "Intercept Time Unknown", "Terminating:" with plain language.

## [1.20.4] - 2026-04-13

### Added
- **Prediction Engine V5 (Shadow Mode)**: XGBoost classifier — 60.6% top-1 / 80.3% top-3 (+8.5pp / +5.6pp over V4). Runs silently alongside V3 and V4 on every SMS prediction via ONNX runtime. Graded and logged to `predictionStats` at trip end.

### Fixed
- **Admin Inbox always empty**: `loadInbox` was running in parallel with `loadStops` and before trips were ready — scanning zero trips against an empty library and finding nothing. Now runs sequentially after both are loaded.

### Changed
- **Admin layout**: Stop Library is now the primary content area. Inbox and Consolidation moved to a narrower sidebar on the right.

## [1.20.3] - 2026-04-13

### Added
- **Prediction Engine V4 (Shadow Mode)**: Logistic regression classifier trained on 385 trips (Jan–Apr 2026). Runs silently alongside V3 on every SMS prediction — logs its guess and grades it when the trip ends. 52% top-1 / 74% top-3 accuracy on held-out test set. Does not affect user-facing output.
- **TTC Topology** (`ml/topology.json`): Ordered stop sequences for Lines 1, 2, 4, 5 — foundation for direction-aware filtering in future inference.
- **ML training pipeline** (`ml/`): Export script, training notebook, and model weights. See `docs/ENGINE.md` for full V4 history.

## [1.20.2] - 2026-04-13

### Fixed
- **Map freeze**: Moved `leaflet.markercluster` CSS and JS from `unpkg.com` to `cdnjs.cloudflare.com` — unpkg's unreliability was blocking page rendering on every load.
- **Map controls**: Removed broken `setupMapControls()` from `map.js` that called `MapEngine.setFilter()` (which doesn't exist) and duplicated event listeners already set up by `MapEngine.setupControls()`.

### Changed
- **Logo is now a link**: Clicking the TransitStats logo navigates to `/dashboard` from any page.
- **Nav simplified**: Removed the redundant Dashboard nav item — the logo now serves as home.

## [1.20.1] - 2026-04-13

### Security
- **Dependency update**: Upgraded `firebase-functions` to latest and patched critical axios vulnerabilities (SSRF and metadata exfiltration via header injection).

## [1.20.0] - 2026-04-13

### Fixed
- **Auth persistence**: Explicitly set Firebase auth persistence to `LOCAL` so sessions survive tab closes and home screen re-opens.

### Added
- **Mobile nav**: Header no longer requires horizontal scrolling on small screens — nav items collapse to icons-only on ≤768px, logo text hides, and padding tightens.
- **SMS: Conversation history**: The AI now remembers the last 5 Q&A turns (within a 30-minute window) so short follow-ups like "Why not?" and "What about weekdays?" have context from the previous exchange. History is stored per-user in a `conversations` Firestore collection and loaded alongside the trip snapshot on every query.

### Fixed
- **SMS: Stop pair run times**: `get_stop_pair_stats` now fetches and returns individual run times alongside avg/min/max durations, so the AI can answer "what are all the run times between X and Y?" queries.
- **SMS: Short conversational replies**: Lowered the fallback query heuristic threshold from 4 words to 2, so short follow-ups like "Why not?" are passed to the AI instead of triggering the "Could not understand" fallback.

### Changed
- **Rocket Control Labels**: Updated Rocket instrument control language to plain, user-facing terms in `Tools/Rocket/index.html` (`Interlock` → `Doors Closed`, `Aspect` → `Red Light`, `Traction State` → `In Motion`).

## [1.19.2] - 2026-04-08

### Fixed
- **Map Rendering**: Resolved a critical layout issue where the map container had zero height due to missing CSS classes.
- **Admin Synchronization**: Patched a data mismatch in the Admin Triage engines by correctly exposing `Trips` to the global scope and ensuring the initialization sequence waits for Firestore synchronization.
- **Rocket Instrumentation**: Fixed a breakage in the Rocket research instrument where control buttons were non-functional due to a missing event listener registration block.
- **Rocket Recovery**: Corrected a state restoration bug in `recoverActiveSession` that caused instrument states to reset on page refresh.
- **Shared UI Support**: Restored missing header and navigation layout styles for the new MPA architecture.

### Security
- **Global XSS Hardening**: Neutralized high-severity DOM XSS vulnerabilities in `TripFeed`, `TripStatsView`, and `PredictionView` by replacing unsafe `innerHTML` interpolation with `textContent` and `Utils.hide()` sanitization.

## [1.19.1] - 2026-04-08

### Security
- **Insecure Randomness (CodeQL #33)**: Replaced `Math.random()` with `crypto.getRandomValues` in the Rocket instrument for cryptographically strong session identifiers.
- **DOM XSS Remediation (CodeQL #35)**: Neutralized an XSS vector in the GTFS administration panel by replacing unsafe `innerHTML` interpolation with secure textContent and DOM element creation.

## [1.19.0] - 2026-04-08

### Added
- **Account Personalization**: Implemented a `Display Name` configuration in Account settings. Users can now set a custom handle, overriding the default email-prefix identity in the header and dashboard.
- **Self-Service Security**: Integrated a `Reset Password` trigger within the Account settings grid, leveraging Firebase's secure recovery flow.
- **Centralized Modal Management**: Deployed a project-wide `ModalManager` to orchestrate all backdrop, focus, and state transitions for system dialogs.

### Changed
- **Modular Administrative Architecture**: Deconstructed the monolithic `js/admin.js` into specialized, testable sub-engines: `GTFSEngine` (registry syncing), code-named `AdminTriage` (inbox management), and `AdminLibrary` (stop indexing).
- **Decoupled Trip Ecosystem**: Refactored the core `js/trips.js` into an orchestrator that delegates to new high-performance engines: `TripController` (data/Firestore), `TripFeed` (visual rendering), `TripStatsView` (analytics), and `PredictionView` (intelligence).
- **Tripartite Settings Interface**: Redesigned the primary configuration modal into a high-density `Account | Settings | Beta` architecture. Groups security, environment configuration, and "Laboratory" experimental features into distinct visual sectors.
- **Satin-Zinc UI Refinement**: Hardened the platform's visual language with modern CSS grid utilities and premium card styles, ensuring the new modular components maintain a cohesive, technical aesthetic.

### Fixed
- **Identity Fallback**: Resolved a regression where users were stuck with an email-handle identity. The system now prioritizes Firestore-linked display names with a clean fallback to the local email part.
- **Reference Integrity**: Standardized all modal calls to use unified IDs, eliminating race conditions during multi-step triage workflows.
- **Technical Debt**: Significant reduction in technical debt by slashing monolithic file sizes and moving logic to specialized, reusable shared modules.

## [1.18.0] - 2026-04-07

### Changed
- **MPA Migration**: Converted the app from a single-page app to a multi-page architecture. Each view (`/dashboard`, `/insights`, `/map`, `/admin`, `/users`, `/rocket`) is now its own HTML page with clean URLs and proper browser history. `main.js` retired; replaced by `js/pages/` entry files and `js/shared/` infrastructure (`auth-guard.js`, `header.js`). Vite config updated to 7-entry build.
- **Shared Header**: Nav bar and settings modal are now injected at runtime by `header.js` and shared across all pages. Logo links to `/dashboard`. Nav items are `<a>` links with active-page highlighting. Rocket link visible to admins only.
- **Rocket Integration**: Rocket is now a full member of the app — shared header, shared auth guard (admin-only), consistent branding. Custom "ROCKET RESEARCH" header and "Active Researcher" auth banner removed.
- **Rocket Fixes**: Replaced `prompt()` for end stop with an inline input form. Replaced all `alert()` calls with `UI.showNotification()`. Added session recovery on page load (detects in-progress Firestore session and restores instrument state). GPS permission requested upfront at page load rather than at finalize; GPS failures are always graceful and non-blocking.
- **URL Cleanup**: Added `cleanUrls: true` to Firebase Hosting config and a catch-all SPA rewrite. Magic link continue URL fixed to always use `/` instead of `window.location.pathname`, preventing `/index.html` appearing in post-login URLs. `completeMagicLinkSignIn()` now called on boot so the Firebase query params are stripped from the URL immediately after sign-in.

## [1.17.5] - 2026-04-07

### Security
- **Rocket Auth Shield**: Implemented a mandatory authentication gate for the Rocket Research Instrument (`/Tools/Rocket`). Rocket now requires a valid Transit Stats profile to start a session, redirecting unauthenticated users to the main login.
- **Data Integrity**: Removed legacy `rocket_guest` fallback logic. All high-precision research data and summary badges are now strictly attributed to the authenticated user's `uid`.

### Changed
- **Rocket UI Overhaul**: Redesigned the Rocket instrument with a premium "Atlas" aesthetic. Replaced the standalone black-theme layout with the core Transit Stats design language, featuring glassmorphism, Inter typography, and improved mobile-first controls.
- **Rocket Researcher Profile**: Added a persistent auth banner to the Rocket interface to confirm the active research identity.


## [1.17.4] - 2026-04-07

### Added
- **Rocket Restoration**: Fully restored the Rocket research instrument to `/Tools/Rocket/` after it was lost in a git rebase. Implemented the standalone high-precision state machine (Doors, Signal, Motion) with GPS anchoring.
- **Rocket Architecture**: Implemented a dual-collection strategy for research integrity. Heavy event streams go to `rocket_trips`, while lightweight summary "badges" (linked via `rocketTripId`) are written to the main `trips` collection for dashboard visibility.
- **Rocket Hosting**: Defined `/rocket` rewrite in `firebase.json` for direct access via `transitstats.fyi/rocket`.

### Fixed
- **Repository**: Terminated three stuck `git rebase --continue` processes that had been hung for >100 minutes, resolving index locks and performance issues.

## [1.17.3] - 2026-04-07

### Security
- **XSS — admin.js inline onclick handlers**: Replaced all inline `onclick="window.Admin.*"` handler patterns in `renderConsolidation`, `renderLibrary`, `renderInbox`, `openLinkModal`, and `loadRouteLibrary` with `data-action` / `data-*` attributes and event delegation set up in `setupListeners`. Eliminates injection risk from Firestore-sourced stop names and route IDs interpolated into HTML attribute strings.
- **XSS — users.js inline onclick handler**: Replaced `onclick="window.Users.togglePremium(...)"` on premium toggle buttons with `data-action` attributes and a delegated listener on `#users-list` initialized in `Users.init()`.
- **XSS — Rocket `updateTripLabel`**: Replaced `label.innerHTML` with DOM element creation (`createElement` + `textContent`) to prevent injection from Firestore-sourced route/direction strings.

## [1.17.2] - 2026-04-07

### Fixed
- **Security**: Patched five high-severity Vite vulnerabilities (#38-43) including Arbitrary File Read via WebSocket, Path Traversal in Optimized Deps .map handling, and `server.fs.deny` bypass. Enforced global upgrade to Vite 8.0.6.

## [1.17.1] - 2026-04-07

### Fixed
- **Deployment**: Made `TWILIO_MESSAGING_SERVICE_SID` an optional secret in `functions/sms.js`. This prevents "missing secret" errors from blocking Firebase deployments when RCS isn't fully configured.

## [1.17.0] - 2026-04-07

### Added
- **Rocket** — a new high-precision research instrument (`/Tools/Rocket`) for decomposing transit journeys into dwell time, signal delay, and running time with millisecond accuracy.
- **`rocket_trips` Firestore collection** — stores full event streams (GPS-anchored state changes) per research session, separate from the standard `trips` history.
- **Rocket → Transit Stats sync** — finalizing a Rocket session automatically writes a summary entry to the `trips` collection (route, direction, start/end stop, duration, `rocketTripId`).
- **Research badge on trip cards** — Transit Stats trip cards display a technical badge when the trip was recorded via the Rocket instrument.
- **RCS Support**: Messages are now sent via a Twilio Messaging Service when `TWILIO_MESSAGING_SERVICE_SID` is configured. Twilio automatically upgrades delivery to RCS for supported devices and falls back to SMS transparently.

### Security
- **Firestore rules for `rocket_trips`** — public read for research transparency; authenticated owner-only write and delete.

## [1.16.0] - 2026-04-02

### Changed
- **SMS Trip Start Message**: "Heading to" replaced with "Predicted end:" for clarity. End shortcut numbers now reflect actual prediction count (e.g. `END 1` instead of `END 1/2/3` when only one prediction exists).

### Added
- **Coordinate Fallback Policy**: Implemented a stop-library lookup in the Map Engine to ensure trips logged via SMS (often missing point coordinates) populate as dots by using their stop names.
- **Content Deduplication**: Incoming messages with identical phone+body within 60 seconds are dropped — catches iPhone carrier retries that arrive with a new MessageSid.
- **Outbound Loop Detection**: Outbound SMS bodies are hashed on send; if the same body arrives as an incoming message within 2 minutes, it is silently dropped — prevents the app from processing its own replies as commands.
- **Self-Loop Guard**: Incoming messages where `From` equals the app's own Twilio number are dropped immediately before any processing.

### Fixed
- **Map Initialization Race Condition**: Patched a timing issue where map markers wouldn't render if the stops library finished loading after the initial trip data fetch.
- **Stop Alias Correction**: Removed incorrect `FINCH WEST` alias from Lawrence West Station; added Finch West Station and 27 other missing TTC subway stations with proper aliases derived from submitted trip history.
- **Gemini Direction Validation**: AI-parsed trip starts now validate direction against canonical values (Northbound, Southbound, etc.) — prevents hallucinated direction strings like `Northq` from being stored.

## [1.15.0] - 2026-03-31

### Added
- **STATS Command Refinement**: Upgraded the `STATS` SMS command to provide 7-day, 30-day, and month-to-date comparisons with trend indicators for premium users.

### Changed
- **Expanded Settings**: Added a new profile management section in the Settings modal with transit agency selection, beta feature toggles, and linked phone number visibility.
- **Preference UI Polish**: Updated the Settings modal layout with a clean, high-contrast design for the new preference controls and custom toggle switches.
- **Internal Optimization**: Decoupled user profile logic into a dedicated `Profile` module for better maintainability.

### Security
- **Strict SMS Rate Limiting**: Implemented a sliding window request throttle in `db.js`. Limits users to **8 messages per 1-minute window** to protect against accidental SMS loops and malicious flooding.
- **URL Spam Blocking**: Added a regex-based rejection layer in `dispatcher.js` that silently drops incoming texts containing URLs (`http`, `www`, etc.).
- **Vulnerability Remediation**: Performed a critical security audit on Cloud Functions dependencies (`npm audit fix`), patching `node-forge`, `path-to-regexp`, and `brace-expansion`.
- **Enhanced Idempotency Guards**: Hardened the SMS entry point to ensure duplicate Twilio signals are ignored at the atomic database level.

## [1.14.1] - 2026-03-31

### Added
- **Trip destination predictions in SMS (admin only)**: When a trip is started, admins now see up to 3 ranked destination predictions in the confirmation SMS. Reply `END 1`, `END 2`, or `END 3` to end at a predicted stop.
- **`PredictionEngine.guessTopEndStops()`**: New method returning an array of top-N ranked exit stop predictions.

### Fixed
- **Auth button stuck in "Sending..."**: Fixed a bug where the "Send Magic Link" button remained disabled after successfully sending an email. Added `finally` blocks to reset button states.
- **Missing loading state on password reset**: Added "Sending..." loading state to the "Forgot Password?" button for better user feedback.

## [1.14.0] - 2026-03-30

### Changed
- **`setTheme()` crash-proofed**: Added optional chaining to `DOM.modals` guards.
- **Removed redundant inline HTML handlers**: Cleaned up legacy `oninput`/`onclick` workarounds in favor of module-based listeners.

### Fixed
- **Critical: Silent JS module crash on boot**: Fixed a `TypeError` where `setTheme()` was called before DOM initialization, which previously killed all event listeners.
- **Auth step transition broken**: Defined the `.hidden` CSS utility class which was previously missing.
- **Stats/Map/RouteTracker initialization**: Fixed a race condition where analytics modules wouldn't initialize correctly after login.

## [1.13.0] - 2026-03-28

### Added
- **Trip review banner**: Internal flagging for trips with unrecognized routes, allowing inline triage in the feed.

### Fixed
- **Login Flow and Boot Sequence**: Implemented a robust `readyState` check for application initialization and hardened 'Continue' button logic.
- **Route tracker broken**: Fixed incorrect reference to `allTrips` preventing route completion stats from rendering.
- **Profile view crash**: Replaced non-existent `UI.fadeInSection()` with direct opacity assignment.

### Security
- **Dependency updates**: Fixed 3 vulnerabilities (brace-expansion, node-forge, picomatch) via `npm audit fix`.

## [1.12.0] - 2026-03-26

### Added
- **AI Analytics Tools**: Gemini can now answer detailed questions about specific dates, date ranges, route stats, riding streaks, and average trip durations via direct Firestore queries.

### Changed
- **`INCOMPLETE` renamed to `FORGOT`**: Command renamed for clarity; all SMS messages updated.
- **Removed `LINK` command**: Journey linking is now handled automatically.
- **Route display**: Standardized SMS messages by removing redundant "Route" prefixes.

### Fixed
- **Confirm-start DISCARD/FORGOT**: Improved state transitions when resolving active trip conflicts.
- **Day-of-week year filter**: Fixed string-to-number coercion in AI query tools.
- **Natural language misclassification**: Tightened `isValidRoute` logic to prevent long questions from being parsed as trip starts.

## [1.11.0] - 2026-03-25

### Added
- **Query logging**: Every natural language query is now logged to `queryLogs` for administrative auditing.
- **Admin user tier**: Profiles with `isAdmin: true` bypass Gemini rate limits; premium users increased to 50 queries/hr.
- **Day-of-week query support**: Added all-time day-of-week breakdown tools for the AI.

### Changed
- **SMS query fallback**: Improved AI intent classification to catch multi-word questions that Gemini previously missed.

### Fixed
- **Firestore index**: Added composite index on `userId ASC + endTime ASC` for AI query tools.

## [1.10.0] - 2026-03-24

### Added
- **UI Heatmap**: Implemented a GitHub-style Activity Grid on the dashboard to visualize ridership patterns.
- **AI Search Tools**: GEMINI now has direct database search capabilities for all-time stats.

### Changed
- **Journey Linking**: Removed redundant "Reply LINK" suggestions.

### Security
- **ReDoS Protection**: Fixed backtracking vulnerabilities in `utils.js` and `predict.js` identified by CodeQL.
- **Dynamic Method Safety**: Secured the command dispatcher with strict whitelisting.

## [1.9.12] - 2026-03-22

### Changed
- **STATS command formatting**: Reformatted reply to a cleaner sentence structure; period comparisons (↑/↓ %) are now premium-only.
- **Security Dependency Correction**: Bumped `vitest` and `@vitest/ui` to 4.0.18 to resolve prototype pollution.

## [1.9.11] - 2026-03-22

### Added
- **Premium AI Stats**: Gated natural-language queries behind `isPremium: true`.
- **`ASK` command**: Added explicit entry point for AI Stats.
- **Users admin page**: Web-based administration for managing premium status.

### Changed
- **Error notifications**: Replaced remaining `alert()` calls with `UI.showNotification()`.
- **Destructive confirmations**: Converted sensitive actions to the two-step button pattern.
- **Initialization Polish**: Pinned dependency versions and updated GitHub Actions.

### Fixed
- **Firestore listener cleanup**: Ensuring listeners are disposed of on signout.

### Security
- **XSS Hardening**: Applied `escapeForJs` and `Utils.hide()` across all dynamic admin and template elements.
- **XSS remediation**: Hardened inline HTML handlers in `admin.js` and `templates.js`.

## [1.9.10] - 2026-03-22

### Added
- **Prediction Test Suite**: Added 137 unit tests covering parsing, utility exports, and the full prediction engine logic.

---

## Older Releases
Historical changes can be found in the [Changelog Archive](./CHANGELOG_ARCHIVE.md).

---
*See [migrations/](./migrations/) for scripts to address technical debt.*
