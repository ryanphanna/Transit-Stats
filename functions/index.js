/**
 * Firebase Cloud Functions for Transit Stats
 *
 * Entry point that exports all cloud functions.
 * SMS webhook handler for Twilio-based trip tracking.
 */

const admin = require('firebase-admin');
const functions = require('firebase-functions');

// Initialize Admin SDK if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const { sms } = require('./sms');

// Export the SMS webhook function
exports.sms = sms;
