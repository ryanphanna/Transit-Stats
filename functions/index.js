/**
 * Firebase Cloud Functions for Transit Stats
 * Entry point — exports all cloud functions.
 * SMS webhook for Twilio-based trip tracking.
 */

const admin = require('firebase-admin');

// Initialize Admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp({
    serviceAccountId: 'firebase-adminsdk-fbsvc@transitstats-21ba4.iam.gserviceaccount.com',
  });
}

const { sms } = require('./sms');
const { api } = require('./api');
const { publicProfile } = require('./lib/public-profile');
const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore');
const finalization = require('./lib/finalization');
const { enrichStopDoc } = require('./lib/atlas-enrich');

// Export the SMS webhook function
exports.sms = sms;

// Export the iOS companion app API endpoint
exports.api = api;

// Public profile stats — the only sanctioned way to read another user's trip
// data. Trips are not publicly readable via Firestore rules; this endpoint
// reads them with the Admin SDK and returns only aggregate/anonymized fields.
exports.publicProfile = publicProfile;

// Background trigger: fill Layer-2 facts (direction, routes, official-name alias)
// on newly created stop docs from Atlas R2 stops-meta. No-ops gracefully while
// the artifact doesn't exist yet; never touches the user-chosen name.
exports.onStopCreated = onDocumentCreated('stops/{stopId}', async (event) => {
  const stop = event.data?.data();
  if (!stop) return;
  try {
    const db = admin.firestore();
    const outcome = await enrichStopDoc(db, admin, event.params.stopId, stop);
    console.log(`onStopCreated ${event.params.stopId}: ${outcome}`);
  } catch (err) {
    console.error('onStopCreated enrichment failed', err.message);
  }
});

// Background trigger: runs post-end finalization (learning, grading, journey linking, etc.)
// when a trip first receives endTime. Heavy side-effects are fully out of the SMS path.
// High-impact corrections set exclusion flags on the trip but do NOT auto-trigger
// re-finalization (prevents tainting accuracy metrics / models from known-bad data).
// Use triggerManualFinalization(tripId) for explicit reprocessing after corrections.
exports.onTripFinalized = onDocumentWritten('trips/{tripId}', async (event) => {
  const before = event.data.before?.data();
  const after = event.data.after?.data();
  if (!before || !after) return;

  const tripId = event.params.tripId;
  const justEnded = before.endTime == null && after.endTime != null;

  if (justEnded) {
    console.log(`[Background] Running finalization for trip ${tripId} (reason: ended)`);

    try {
      await finalization.runPostEndFinalization(after);
    } catch (err) {
      console.error(`[Background] Finalization failed for ${tripId}`, err);
    }
  }
});
// Tue  5 May 2026 10:55:13 EDT
// Tue  5 May 2026 11:08:01 EDT
// Tue  5 May 2026 11:19:21 EDT
