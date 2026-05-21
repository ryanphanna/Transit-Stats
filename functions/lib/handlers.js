/**
 * Handler modules — barrel re-export for dispatcher compatibility.
 */
const {
  handleHelp,
  handleStatus,
  handleDiscard,
  handleAddNotes,
  handleUnlink,
  handleIncomplete,
  handleRegister,
  handleVerificationCode,
} = require('./handlers-commands');

const {
  determineStaleness,
  handleTripLog,
  handleConfirmStart,
  handleEndTrip,
} = require('./handlers-trip');

const {
  handleQuery,
  handleStatsCommand,
  handleJourneyLink,
} = require('./handlers-query');

const {
  fillPredictions,
  handleMmsTrip,
} = require('./handlers-intelligence');

module.exports = {
  handleHelp,
  handleStatus,
  handleDiscard,
  handleAddNotes,
  handleUnlink,
  handleIncomplete,
  handleRegister,
  handleVerificationCode,
  handleTripLog,
  handleConfirmStart,
  handleEndTrip,
  handleQuery,
  handleStatsCommand,
  handleJourneyLink,
  handleMmsTrip,
  fillPredictions,
};
