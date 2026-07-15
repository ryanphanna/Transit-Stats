# Incidents

This document tracks historical security and data-integrity incidents and the remediation steps taken to resolve them.

---

## Credential Exposure Incident (March 2026)

During the v1.4.2 security audit, a `functions/.env.transitstats-21ba4` file containing live Twilio credentials was found to be tracked in git history.

**What was exposed:**
- `TWILIO_ACCOUNT_SID` (redacted)
- `TWILIO_PHONE_NUMBER` (redacted)

**Remediation Steps:**
1. **Credential Rotation**: A new Auth Token was generated in the Twilio Console.
2. **Secure Configuration**: The new token was stored using `firebase functions:config:set`.
3. **Redeployment**: Cloud Functions were redeployed with the latest security patches (v1.4.2).
4. **Git Hygiene**: `functions/.env` and `functions/.env.*` were added to `.gitignore`.

**Status: Resolved**
The credentials listed above are now inert. The Auth Token was rotated on March 4, 2026, rendering the exposed credentials invalid.

---

## Public Profile Trip Data Exposure (July 2026)

The `trips` Firestore security rule granted read access to the *entire* trip document once a trip's `isPublic` flag was true, so it could be fetched directly by the public profile page. Firestore rules can't restrict individual fields on a read — the intent was only to expose the aggregate stats and heatmap the public profile UI renders, but the rule as written let anyone inspecting network traffic on a public profile page read the full document for every public trip, including `userId`, route, stop names, and exact timestamps.

**What was exposed:**
- `userId`, route, start/end stop names, exact trip timestamps for any trip marked public — readable by anyone who opened dev tools on a public profile page, not just the totals and heatmap actually shown

**What was NOT exposed:**
- Private (non-public) trips — those were correctly scoped to the owning user throughout
- Any credentials, tokens, or account-recovery information

**Remediation Steps:**
1. **Rule tightened**: `trips` documents are no longer publicly readable under any condition, public or not.
2. **New server-side endpoint**: a `publicProfile` Cloud Function (`functions/lib/public-profile.js`) reads public trips with the Admin SDK and returns only aggregate/anonymized fields (trip/hour totals, untyped lat/lng points for the heatmap).
3. **Frontend updated**: `js/public.js` now calls that endpoint instead of querying Firestore directly.
4. **Deployed and verified**: confirmed the new rule and function are live in production.

**Status: Resolved**
Found and fixed in the same session, before any known external report. No indication of external access to the exposed data at this time.

---

## Background Finalization Silently Broken for 6 Weeks (May–July 2026)

A refactor (commit `29ff83f`, 2026-05-26) moved trip-ending logic — prediction grading, journey linking, and network/habit learning — from the synchronous SMS handler into an async `onTripFinalized` Firestore trigger. The trigger passed the raw `event.data.after.data()` into the shared finalization code without the document's own ID (`Firestore.data()` never includes it). Every downstream operation keyed on the trip ID failed: `predictionStats` writes threw and were silently caught, and the closing `backgroundFinalizedAt` update threw on an empty document path. Trips kept logging normally — only the invisible background step broke, with no user-facing symptom.

The same refactor also dropped the `agency`/`route` fields from `predictionStats` writes and the grading call for V3's own end-stop prediction, and a related bug (not new to this refactor) graded `habit-endstop` predictions against the wrong field (`habitPrediction.stop`, the starting stop, instead of `habitPrediction.endStop`).

**Impact:**
- No prediction accuracy data (`predictionStats`), no automatic journey linking, and no network/habit model learning for any trip ended between 2026-05-26 and 2026-07-10 (131 trips)
- No security or privacy impact — trip data itself was recorded correctly throughout; only the internal analytics/ML pipeline was affected
- Went undetected for ~6 weeks because nothing surfaced the failure to a user-visible surface or a monitored one

**Remediation Steps:**
1. **Root cause fixed**: `onTripFinalized` now merges `{ id: event.params.tripId, ...after }` before calling into finalization, matching the pattern already used correctly elsewhere in the codebase.
2. **Regression fields restored**: `agency`, `route`, V3 end-stop grading, and the `habit-endstop` field mapping were all fixed in the same pass.
3. **Backfilled**: all 131 affected trips were reprocessed in chronological order (required for correct journey linking); prediction stats were patched/corrected rather than reprocessed a second time where duplication would otherwise result.
4. **Deployed and verified**: confirmed live via Cloud Function logs and a direct Firestore check before and after.

**Status: Resolved.** See [Issue #153](https://github.com/ryanphanna/Transit-Stats/issues/153) and `CHANGELOG.md` for full technical detail.

**Prevention going forward:** the repo already has an emulator-dependent e2e test file that isn't run in normal workflow — running it would have caught the missing document ID immediately. No alerting exists today for "a Firestore collection stopped receiving writes," which is why this took 6 weeks to notice rather than a day.
