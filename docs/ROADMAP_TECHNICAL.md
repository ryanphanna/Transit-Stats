# Transit Stats — Technical Roadmap

Feature backlog organized by theme. Items within each theme are roughly ordered
by impact vs. effort. This is a living document — priorities shift, but themes are stable.

---

## Theme 1 — Messaging System (RCS / SMS)

The messaging layer is the primary trip logging interface. Core commands work; these are
quality and coverage improvements.

- [ ] **`STATS` command improvements** — extend the structured stats reply with weekly
  and monthly comparisons, not just all-time totals.
- [x] **Ambiguous stop handling** — when a stop name matches multiple library entries
  (e.g. "King" on multiple routes), reply with a disambiguation prompt rather than
  picking arbitrarily.
- [ ] **Multi-leg journey via SMS** — the LINK command exists but is manual. Detect
  and surface the link prompt earlier, without requiring the user to know the command.
- [ ] **International number support** — phone number normalization currently assumes
  North American format. Standardize to E.164 throughout.
- [ ] **Stop photo via MMS** — user snaps a photo of a stop sign or TTC stop number pole and sends it via MMS. Cloud Function receives the media URL, runs OCR (Google Cloud Vision or equivalent), extracts the stop number, and resolves it against the stops library. Removes the need to manually type stop codes.
- [ ] **RCS suggested reply buttons** — attach tappable quick-reply chips to key responses for Android RCS users. Priority targets: `STATUS` reply (END TRIP / DISCARD / STATS) and trip-start confirmation (predicted end stops as tappable buttons, replacing the `END 1/2/3` shortcut system). SMS users receive the plain-text version unchanged via Twilio's automatic fallback.

---

## Theme 2 — Dashboard & UI

- [ ] **Transit Wrapped** — visual year-in-review with personal records, most-used
  routes and stops, and shareable summary cards. Requires a full calendar year of data
  for the first cohort.
- [ ] **Custom Goal Tracker** — users set a monthly trip target with a progress bar
  and streak visualization on the dashboard.
- [ ] **Route Heatmaps** — geographic heat layer showing most-frequent corridors,
  not just stop markers.
- [ ] **Suggested Routes** — proactive dashboard cards surfacing predicted next trip
  once prediction accuracy clears 90%. Feeds from the engine's confidence score.
- [ ] **Journey view** — a dedicated view for multi-leg journeys, showing transfer
  gaps, total trip time, and per-leg breakdown.
- [ ] **Public trip feed** — opt-in shareable profile showing ridership stats and
  recent routes. Read-only, no personal stop detail.

---

## Theme 3 — Stop & Route Data

- [ ] **Stop alias coverage** — expand the stops library to cover more agencies and
  surface more alias variants. Current coverage is TTC-heavy.
- [ ] **Multi-agency stops (`agencies` array)** — replace the single `agency` field on
  stop documents with an `agencies` array, so shared transit hubs (Union Station, etc.)
  are stored once and matched for any operator that boards there. Requires migrating
  existing stop documents and updating `lookupStop`/`findMatchingStops` to query with
  `array-contains`. Currently worked around by a cross-agency name fallback in `lookupStop`.
- [ ] **Scheduled GTFS refresh** — static GTFS data ages. Add a Cloud Function that
  detects feed staleness and triggers a re-import, rather than requiring a manual
  admin import.
- [ ] **Stop merge history** — when stops are merged via the Consolidation Panel,
  log the merge so it can be audited and reverted if needed.
- [ ] **Route completion tracking** — extend the Route Tracker beyond ridden/missing
  to show last-ridden date and estimated completion date at current pace.

---

## Theme 4 — Multi-Agency

Currently TTC-focused. The data model and SMS parser are largely agency-agnostic;
the binding is in the stops library and route metadata.

- [ ] **OC Transpo support** — Ottawa stop library and route metadata.
- [ ] **GO Transit support** — intercity rail/bus trips with origin/destination stations.
- [ ] **Per-agency analytics** — dashboard views filterable by agency for users who
  ride multiple systems.
- [ ] **Agency auto-detection** — infer the agency from the stop name at trip start
  rather than requiring the user to specify.
- [ ] **Per-trip timezone storage** — store the IANA timezone on each trip document at
  log time (derived from the agency via `lookupAgencyTimezone`). Currently, ASK queries
  that span multiple cities (e.g. "how many trips this month" after returning from LA)
  use the most recent trip's timezone for the entire date window, which misattributes
  trips taken near midnight in the other city. Storing timezone per-trip allows correct
  date bucketing across any query window regardless of city-switching history.

---

## Theme 5 — Infrastructure

- [ ] **Cloud Functions Node upgrade** — standardize on Node 22 across all functions
  environments (currently mixed).
- [ ] **Firestore index audit** — review composite indexes against actual query patterns.
  Remove unused indexes; add missing ones surfaced by slow query logs.
- [x] **Rate limiting on SMS handler** — per-number request throttle to prevent
  accidental SMS loops from hammering Firestore.
- [ ] **Error alerting** — Cloud Function errors currently surface only in logs.
  Add structured alerting for handler failures and Gemini proxy errors.
- [ ] **End-to-end test for SMS flow** — integration test covering the full
  START → END → STATS command sequence against a real (or emulated) Firestore instance.

---

## Theme 6 — Rocket Research Instrument

Rocket is a standalone mobile-first web tool for high-precision transit research. It
decomposes journeys into dwell time (doors open), signal delay (at red), and running
time (in motion) with millisecond-accurate state changes and GPS-anchored events.

- [x] **Core state machine** — three-state tracker (DOORS_OPEN, AT_RED, IN_MOTION) with
  haptic feedback and live time breakdown.
- [x] **Web form entry** — Route, Direction, Start Stop fields. End Stop captured at
  finalize time. No SMS dependency.
- [x] **Live Firebase sync** — every state change streams to `rocket_trips` in real time.
- [x] **Auto-sync to Transit Stats** — finalizing a session writes a summary entry to
  `trips` automatically. No manual step.
- [x] **Transit Stats integration** — Research badge on trip cards; `rocketTripId` link field.
- [ ] **Stop autocomplete** — resolve start/end stop names against the stops library.
- [ ] **Research map view** — visualize GPS-anchored events on a route map to identify
  where dwell/signal delays cluster spatially.
- [ ] **Aggregate analytics** — cross-trip summaries per route showing average dwell,
  signal, and running time breakdowns.
- [x] **Session recovery** — if the page is refreshed mid-trip, reconstruct `startTime`
  from the first event's timestamp and resume.
