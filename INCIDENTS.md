# Security Incidents

This document tracks historical security incidents and the remediation steps taken to resolve them.

---

## Credential Exposure Incident (March 2026)

During the v1.4.2 security audit, a `functions/.env.transitstats-21ba4` file containing live Twilio credentials was found to be tracked in git history.

**What was exposed:**
- `TWILIO_ACCOUNT_SID` (`ACd65b...458cd`)
- `TWILIO_PHONE_NUMBER` (`+1343•••0660`)

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
