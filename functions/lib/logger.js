/**
 * Logging utility with PII redaction
 */

/**
 * Redact phone numbers (e.g., +16471234567 -> +1647***4567)
 * @param {string} phone - raw phone number
 * @returns {string} masked phone number
 */
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return 'Unknown';
  if (phone.length < 5) return '***';
  return phone.substring(0, 5) + '***' + phone.substring(phone.length - 4);
}

/**
 * Log information with optional PII masking
 * @param {string} message - The message to log
 * @param {object} data - Optional data object to log (will be redacted)
 */
function info(message, data = {}) {
  const logData = { ...data };

  // Automatically mask known PII fields
  if (logData.phoneNumber) logData.phoneNumber = maskPhone(logData.phoneNumber);
  if (logData.phone) logData.phone = maskPhone(logData.phone);
  if (logData.From) logData.From = maskPhone(logData.From);

  // Redact message body/content if it might contain private info
  if (logData.body) logData.body = `[REDACTED (Length: ${logData.body.length})]`;
  if (logData.Body) logData.Body = `[REDACTED (Length: ${logData.Body.length})]`;

  console.log(`[INFO] ${message}`, Object.keys(logData).length ? logData : '');
}

/**
 * Log error events
 * @param {string} message - Error message
 * @param {Error|object} error - Error object or context
 */
function error(message, error = {}) {
  console.error(`[ERROR] ${message}`, error);
}

/**
 * Log warning events
 * @param {string} message - Warning message
 */
function warn(message) {
  console.warn(`[WARN] ${message}`);
}

module.exports = {
  info,
  error,
  warn,
  maskPhone,
};
