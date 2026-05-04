/**
 * Database module — re-exports all domain modules
 */
const { admin, db } = require('./core');
const { isRateLimited, isGeminiRateLimited, shouldRespondToUnknown, checkIdempotency, checkContentDuplicate } = require('./rate-limit');
const { getUserByPhone, getUserProfile, isEmailAllowed, storeVerificationCode, getVerificationData } = require('./users');
const { getActiveTrip, createTrip, getRecentCompletedTrips, getPendingState, setPendingState, clearPendingState, getLastTripAgency, getTripCount } = require('./trips');
const { lookupStop, findMatchingStops, getRoutesAtStop, getStopsLibrary } = require('./stops');
const { getConversationHistory, saveConversationTurn } = require('./conversations');

module.exports = {
  admin,
  db,
  isRateLimited,
  isGeminiRateLimited,
  shouldRespondToUnknown,
  checkIdempotency,
  checkContentDuplicate,
  getUserByPhone,
  getUserProfile,
  isEmailAllowed,
  storeVerificationCode,
  getVerificationData,
  getActiveTrip,
  createTrip,
  getRecentCompletedTrips,
  getPendingState,
  setPendingState,
  clearPendingState,
  lookupStop,
  findMatchingStops,
  getRoutesAtStop,
  getStopsLibrary,
  getConversationHistory,
  saveConversationTurn,
  getLastTripAgency,
  getTripCount,
  getFirestore: () => db,
  getAdmin: () => admin,
};
