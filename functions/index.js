/**
 * Firebase Cloud Functions for Transit Stats
 *
 * Entry point that exports all cloud functions.
 * SMS webhook handler for Twilio-based trip tracking.
 */

const { sms } = require('./sms');

// Export the SMS webhook function
exports.sms = sms;
