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

## Rules

- **Insights view** contains ONLY the Commute Highlights section. No stats, toggles, peak times, or route/stop lists.
- **No git push** without asking first.
- **Keep CHANGELOG.md updated** under `[Unreleased]` as work is completed.
- **Log significant work** to the TransitStatsLog Notion database (see Gemini.md for Notion sync patterns).
- The `Firebase for Transit Stats.json` key lives at `/Users/ryan/Desktop/Dev/` — use it for admin queries, never commit it.

## Firestore Collections
- `trips` — user trip documents (userId, route, startStop, endStop, startTime, endTime, duration, journeyId, etc.)
- `stops` — stop library (name, code, agency, aliases, lat, lng)
- `stopRoutes` — GTFS stop→route mapping
- `routes` — GTFS route library
- `profiles` — user profiles
- `predictionStats` — per-trip prediction grading
- `predictionAccuracy` — running accuracy summary per user
