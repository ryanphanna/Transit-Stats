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

// Export the SMS webhook function
exports.sms = sms;
// Tue  5 May 2026 10:55:13 EDT
// Tue  5 May 2026 11:08:01 EDT
// Tue  5 May 2026 11:19:21 EDT
