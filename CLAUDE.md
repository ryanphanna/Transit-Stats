# Claude Instructions — TransitStats

## What This Is
A personal Firebase-backed transit trip tracker. Trips are logged via SMS (Twilio → Cloud Functions). The web app is a read/analyze dashboard — no trip logging from the browser.

## Architecture
- **Frontend**: Vanilla JS ES modules, Vite build, Leaflet maps, Lucide icons
- **Backend**: Firebase Cloud Functions (Node.js) in `functions/`
- **Database**: Firestore
- **SMS**: Twilio → `functions/lib/handlers.js` → dispatched via `functions/lib/dispatcher.js`

Key frontend modules:
- `js/main.js` — app boot, view routing, auth, event listeners
- `js/trips.js` — Firestore listener, feed rendering, stats rendering
- `js/stats.js` — pure computation (no DOM)
- `js/predict.js` — client-side prediction engine
- `js/admin.js` — stop library, inbox, GTFS import
- `js/map-engine.js` — Leaflet map
- `js/route-tracker.js` — route completion tracker

## Established Patterns

**XSS**: Always use `Utils.hide()` before injecting user data into `innerHTML`. Never inject raw trip fields (route, stop names, etc.) directly into templates.

**Notifications**: Use `UI.showNotification(message)` for errors and feedback. Never use `alert()`.

**Destructive confirmations**: Use the two-step button pattern — first click arms the button (red, "Tap again to confirm"), second click within 3 seconds executes. Never use `confirm()`.

**Firestore FieldValue**: Use `firebase.firestore.FieldValue.delete()` for removing fields client-side.

## SMS Commands
- `FORGOT` — marks active trip as incomplete (renamed from `INCOMPLETE`)
- `DISCARD` — deletes active trip (or cancels new trip attempt in conflict state)
- `STATUS`, `STATS`, `ASK [question]`, `REGISTER [email]`, `INFO`
- `LINK` command was removed — journey linking is automatic at trip end

## Bug Fix Format
When fixing a bug, always provide:
1. **What was causing it** — plain language explanation of the broken assumption or missing piece
2. **Why the fix works** — the mechanism, not just what changed
3. **What to watch for next time** — forward-looking tip to catch the same class of bug

## Rules

- **Insights view** contains ONLY the Commute Highlights section. No stats, toggles, peak times, or route/stop lists.
- **No git push** without asking first.
- **Keep CHANGELOG.md updated** under `[Unreleased]` as work is completed.
- **Always deploy hosting alongside functions** (`firebase deploy --only hosting,functions`) — hosting-only changes (frontend fixes, auth) won't reach users otherwise.
- **Log significant work** to the TransitStatsLog Notion database (see Gemini.md for Notion sync patterns).
- The `Firebase for Transit Stats.json` key lives at `/Users/ryan/Desktop/Dev/Credentials/` — use it for admin queries, never commit it.

## Firestore Collections
- `trips` — user trip documents (userId, route, startStop, endStop, startTime, endTime, duration, journeyId, etc.)
- `stops` — stop library (name, code, agency, aliases, lat, lng)
- `stopRoutes` — GTFS stop→route mapping
- `routes` — GTFS route library
- `profiles` — user profiles (isPremium, isAdmin, defaultAgency)
- `predictionStats` — per-trip prediction grading
- `predictionAccuracy` — running accuracy summary per user
- `queryLogs` — AI query history (userId, question, answer, timestamp)

## Idempotency Pattern

**Do not write `processedMessages/{MessageSid}` in `sms.js`.** `checkIdempotency()` in the dispatcher already does this atomically — it writes the doc and returns `true` if it already exists (retry). Adding a second write in `sms.js` causes `checkIdempotency` to always see `ALREADY_EXISTS` and drop every message as a duplicate. The dispatcher is the single source of truth for MessageSid deduplication.

## Auth Pattern

**Whitelist check errors must not sign out valid users.** `Auth.checkWhitelist` retries once on Firestore error before returning `allowed: false`. A transient network error on page load used to immediately sign out authenticated users. Never change this to fail-closed on first error without a retry.

## AI Query Tools (functions/lib/gemini.js)
`get_all_time_stats` · `get_all_time_stop_stats` · `get_all_time_route_stats` · `get_monthly_trip_counts` · `get_day_of_week_stats` · `get_day_of_week_stats_for_year` · `get_trips_for_date` · `get_trips_for_date_range` · `get_route_stats_for_period` · `get_riding_streak` · `get_stop_pair_stats` · `get_average_trip_duration` · `get_weekday_vs_weekend_stats` · `get_busiest_weeks` · `get_unique_stops`
