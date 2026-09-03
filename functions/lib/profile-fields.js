function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase().replace(/_/g, '-');
}

function getConfiguredAgency(profile = {}) {
  const value = profile.defaultAgencyMode === 'automatic'
    ? profile.primaryAgency
    : profile.defaultAgency;
  return String(value || '').trim() || null;
}

function getMapStopMode(profile = {}) {
  return profile.mapStopMode === 'exiting' ? 'exiting' : 'boarding';
}

module.exports = {
  normalizeUsername,
  getConfiguredAgency,
  getMapStopMode,
};
