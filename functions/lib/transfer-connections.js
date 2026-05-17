/**
 * Curated transfer-complex connections for reasoning layers like TransferEngine.
 *
 * Stops remain distinct records. This file only declares when separate stops
 * should count as the same rider-meaningful transfer point for journey linking.
 */

const CONNECTION_GROUPS = {
  college_complex: [
    'College Station',
    'College St at Yonge St - College Station',
  ],
};

function normalizeStopName(name) {
  if (!name) return '';
  return name.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const stopToGroup = new Map();
for (const [groupId, stops] of Object.entries(CONNECTION_GROUPS)) {
  for (const stop of stops) stopToGroup.set(normalizeStopName(stop), groupId);
}

function getConnectionGroup(stopName) {
  return stopToGroup.get(normalizeStopName(stopName)) || null;
}

function areConnectedStops(a, b) {
  if (!a || !b) return false;
  const groupA = getConnectionGroup(a);
  const groupB = getConnectionGroup(b);
  return !!groupA && groupA === groupB;
}

module.exports = {
  CONNECTION_GROUPS,
  normalizeStopName,
  getConnectionGroup,
  areConnectedStops,
};
