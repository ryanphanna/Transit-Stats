# Transit Stats — Technical Roadmap

Feature backlog organized by theme. Items within each theme are roughly ordered
by impact vs. effort. This is a living document — priorities shift, but themes are stable.

---

## Theme 1 — SMS System

The SMS layer is the primary trip logging interface. Core commands work; these are
quality and coverage improvements.

- [ ] **`STATS` command improvements** — extend the structured stats reply with weekly
  and monthly comparisons, not just all-time totals.
- [ ] **Ambiguous stop handling** — when a stop name matches multiple library entries
  (e.g. "King" on multiple routes), reply with a disambiguation prompt rather than
  picking arbitrarily.
- [ ] **Multi-leg journey via SMS** — the LINK command exists but is manual. Detect
  and surface the link prompt earlier, without requiring the user to know the command.
- [ ] **International number support** — phone number normalization currently assumes
  North American format. Standardize to E.164 throughout.

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

---

## Theme 5 — Infrastructure

- [ ] **Cloud Functions Node upgrade** — standardize on Node 22 across all functions
  environments (currently mixed).
- [ ] **Firestore index audit** — review composite indexes against actual query patterns.
  Remove unused indexes; add missing ones surfaced by slow query logs.
- [ ] **Rate limiting on SMS handler** — per-number request throttle to prevent
  accidental SMS loops from hammering Firestore.
- [ ] **Error alerting** — Cloud Function errors currently surface only in logs.
  Add structured alerting for handler failures and Gemini proxy errors.
- [ ] **End-to-end test for SMS flow** — integration test covering the full
  START → END → STATS command sequence against a real (or emulated) Firestore instance.
