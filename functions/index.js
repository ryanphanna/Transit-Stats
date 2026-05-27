/**
 * Firebase Cloud Functions for Transit Stats
 * Entry point — exports all cloud functions.
 * SMS webhook for Twilio-based trip tracking.
 */

const admin = require('firebase-admin');

// Initialize Admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const { sms } = require('./sms');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const finalization = require('./lib/finalization');

// Export the SMS webhook function
exports.sms = sms;

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
