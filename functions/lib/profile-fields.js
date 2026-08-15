const PUBLIC_PROFILE_BETA_USERNAME = 'subway-subway-subway';

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase().replace(/_/g, '-');
}

function isPublicProfileBetaOwner(profile = {}) {
  const candidates = [profile.username, profile.emojiUsername, ...(profile.usernameAliases || [])];
  return candidates.some(username => normalizeUsername(username) === PUBLIC_PROFILE_BETA_USERNAME);
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
  PUBLIC_PROFILE_BETA_USERNAME,
  normalizeUsername,
  isPublicProfileBetaOwner,
  getConfiguredAgency,
  getMapStopMode,
};
