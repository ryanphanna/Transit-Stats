/**
 * Configuration validation for SMS service
 */
const functions = require('firebase-functions');

/**
 * Validate required environment configuration on cold start
 * @returns {object} { errors, warnings }
 */
function validateConfiguration() {
  const warnings = [];
  const errors = [];

  // Check Twilio configuration
  const twilioAccountSid = functions.config().twilio?.account_sid;
  const twilioAuthToken = functions.config().twilio?.auth_token;
  const twilioPhone = functions.config().twilio?.phone_number;

  if (!twilioAccountSid) errors.push('Missing twilio.account_sid');
  if (!twilioAuthToken) errors.push('Missing twilio.auth_token');
  if (!twilioPhone) warnings.push('Missing twilio.phone_number (SMS replies disabled)');

  // Check Gemini configuration
  const geminiApiKey = functions.config().gemini?.api_key;
  if (!geminiApiKey) {
    warnings.push('Missing gemini.api_key (AI parsing disabled, will use heuristics)');
  }

  // Log results
  if (errors.length > 0) {
    console.error('❌ Configuration errors:', errors.join(', '));
    console.error('Set missing config with: firebase functions:config:set <key>=<value>');
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Configuration warnings:', warnings.join(', '));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Configuration validated successfully');
  }

  return { errors, warnings };
}

module.exports = {
  validateConfiguration,
};
