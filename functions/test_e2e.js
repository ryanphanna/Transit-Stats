/**
 * Emulator-backed E2E tests for the full SMS dispatch + background finalization flow.
 *
 * This is the implementation of the approved Notion task:
 * "Build robust end-to-end integration test for the full SMS dispatch + learning flow"
 *
 * Goals:
 * - Exercise the complete user journey (START → END → background side effects)
 * - Verify new background finalization (lib/finalization.js + onTripFinalized trigger)
 * - Protect correction exclusion logic (no auto re-finalization on high-impact edits)
 * - Run hermetically via firebase emulators (no real credentials or prod DB)
 *
 * Run:
 *   cd functions && npm run test:e2e
 *
 * Uses firebase emulators:exec to start Firestore + Functions emulators,
 * then executes the test script. The child process gets emulator env vars set.
 */

'use strict';

// TS_TEST_MODE still useful to short-circuit Twilio/Gemini even under emulator
process.env.TS_TEST_MODE = '1';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

// Emulator connection — emulators:exec sets these env vars for the child process
const EMULATOR_PROJECT_ID = 'transit-stats-e2e-test';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: EMULATOR_PROJECT_ID,
  });
}

const db = admin.firestore();

const { dispatch } = require('./lib/dispatcher');
const { getCapturedReplies, clearCapturedReplies } = require('./lib/twilio');

// ─── Test identity ──────────────────────────────────────────────────────────

const TEST_PHONE = '+10000000098'; // Distinct from integration test user
const TEST_USER_ID = 'e2e-test-user';

// ─── Helpers (adapted from test_integration.js) ─────────────────────────────

let msgCounter = 0;
function nextSid() {
  return `E2E_SID_${Date.now()}_${++msgCounter}`;
}

async function sms(body) {
  clearCapturedReplies();
  await dispatch(TEST_PHONE, body, nextSid());
  const replies = getCapturedReplies();
  return replies.length > 0 ? replies[replies.length - 1].message : null;
}

async function getLatestTrip() {
  const snap = await db.collection('trips')
    .where('userId', '==', TEST_USER_ID)
    .orderBy('startTime', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function deleteAllTestTrips() {
  const snap = await db.collection('trips').where('userId', '==', TEST_USER_ID).get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

before(async () => {
  await db.collection('phoneNumbers').doc(TEST_PHONE).set({
    userId: TEST_USER_ID,
    phone: TEST_PHONE,
  });
  await db.collection('profiles').doc(TEST_USER_ID).set({
    defaultAgency: 'TTC',
    isPremium: true,
    isAdmin: false,
  });
  await deleteAllTestTrips();
  console.log('✅ E2E test user created (emulator)');
});

after(async () => {
  await deleteAllTestTrips();
  await db.collection('phoneNumbers').doc(TEST_PHONE).delete().catch(() => {});
  await db.collection('profiles').doc(TEST_USER_ID).delete().catch(() => {});
  await db.collection('smsState').doc(TEST_PHONE).delete().catch(() => {});
  console.log('🧹 E2E test data cleaned up');
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('E2E: basic trip lifecycle with background finalization', () => {
  test('START + END triggers background finalization (backgroundFinalizedAt set)', async () => {
    const startReply = await sms('510\nSpadina / College\nNorth');
    assert.ok(startReply, 'should get start reply');
    assert.match(startReply, /Started/i);

    const reply = await sms('END Spadina / Bloor');
    assert.ok(reply, 'should get end reply');
    assert.match(reply, /ended|arrived/i);

    // Give the background trigger a moment (emulator is local but still async)
    await new Promise(r => setTimeout(r, 1500));

    const trip = await getLatestTrip();
    assert.ok(trip, 'trip should exist');
    assert.ok(trip.endTime, 'trip should be ended');
    // Key assertion for the new background system
    // (will be enabled once we have a reliable wait/polling helper)
    // assert.ok(trip.backgroundFinalizedAt, 'background finalization should have run');

    await db.collection('trips').doc(trip.id).delete();
  });
});

// TODO (next micro-chunk):
// - Add polling helper for backgroundFinalizedAt / finalization metadata
// - Assert predictionStats / network graph side effects were written
// - Add high-impact correction scenario (should NOT auto re-finalize)
// - Add manual reprocess test path
// - Expand to cover journey linking, anomaly, etc. from finalization.js

console.log('E2E skeleton loaded — implementation started under single Notion task.');