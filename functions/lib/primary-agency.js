/**
 * Resolve the agency configured as the rider's primary preference.
 *
 * Legacy profiles without an explicit mode keep their existing defaultAgency
 * behavior. New automatic profiles use the inferred primaryAgency cache.
 */
function getConfiguredPrimaryAgency(profile) {
  if (!profile) return null;
  if (profile.defaultAgencyMode === 'automatic') {
    return String(profile.primaryAgency || '').trim() || null;
  }
  return String(profile.defaultAgency || '').trim() || null;
}

module.exports = { getConfiguredPrimaryAgency };
