const { getConfiguredAgency } = require('./profile-fields');

function getConfiguredPrimaryAgency(profile) {
  return getConfiguredAgency(profile);
}

module.exports = { getConfiguredPrimaryAgency };
