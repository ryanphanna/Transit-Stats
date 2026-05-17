/**
 * Curated transfer-complex connections for reasoning layers like TransferEngine.
 *
 * Stops remain distinct records. This file only declares when separate stops
 * should count as the same rider-meaningful transfer point for journey linking.
 */

const CONNECTION_GROUPS = {
  college_complex: [
    'College',
    'College Station',
    'College St at Yonge St - College Station',
  ],
  queens_park_complex: [
    "Queen's Park",
    "Queen's Park Station",
    'College St at University Ave - Queen\'s Park Station',
  ],
  spadina_complex: [
    'Spadina',
    'Spadina Station',
  ],
  union_complex: [
    'Union',
    'Union Station',
  ],
  king_complex: [
    'King',
    'King Station',
    'Adelaide St West at Yonge St - King Station',
  ],
  dundas_west_complex: [
    'Dundas West',
    'Dundas West Station',
  ],
  broadview_complex: [
    'Broadview',
    'Broadview Station',
  ],
  bathurst_complex: [
    'Bathurst',
    'Bathurst Station',
  ],
  main_street_complex: [
    'Main Street',
    'Main Street Station',
  ],
  bloor_yonge_complex: [
    'Bloor-Yonge',
    'Bloor-Yonge Station',
  ],
  cedarvale_complex: [
    'Cedarvale',
    'Cedarvale Station',
  ],
  keelesdale_complex: [
    'Keelesdale',
    'Keelesdale Station',
  ],
  st_george_complex: [
    'St George',
    'St George Station',
    'Stgeorge',
  ],
  lawrence_west_complex: [
    'Lawrence West',
    'Lawrence West Station',
    'LAWRENCE WEST STATION',
    'LAWRENCE W STATION',
    'Lawrence Weet',
  ],
  sheppard_yonge_complex: [
    'Sheppard-Yonge',
    'Sheppard-Yonge Station',
    'SHEPPARD-YONGE',
  ],
  osgoode_complex: [
    'Osgoode',
    'Osgoode Station',
    'OSGOODE',
  ],
};

const CONNECTED_STOP_PAIRS = [
  ['College / Bay', 'College Station'],
  ['College Station', 'College / Yonge'],
  ['Spadina / Queens Quay', 'Spadina / Queens Quay West'],
  ['Spadina / Harbord', 'Harbord / Spadina'],
  ['Spadina / King', '13161 Spadina / King'],
  ['Queen St West at Spadina Ave', 'Spadina Ave at Queen St West North Side'],
  ['Queen St E / Carlaw Av', '4858 Carlaw & Queen St E'],
  ['Dufferin / Lawrence', 'Lawrence / Dufferin'],
  ['Dufferin&college', '826 College & Dufferin'],
  ['Harbord / Spadina', '8124 Spadina and Harbord'],
  ['Dundas/Sterling', 'Dundas/Sterlingp'],
];

const STOP_NAME_ALIASES = {
  keelsdale: 'keelesdale',
  dufferincollege: 'collegedufferin',
  '826collegedufferin': 'collegedufferin',
  'dundassterlingp': 'dundassterling',
};

function normalizeStopName(name) {
  if (!name) return '';
  const normalized = name.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return STOP_NAME_ALIASES[normalized] || normalized;
}

const stopToGroup = new Map();
for (const [groupId, stops] of Object.entries(CONNECTION_GROUPS)) {
  for (const stop of stops) stopToGroup.set(normalizeStopName(stop), groupId);
}

const connectedPairKeys = new Set();
for (const [a, b] of CONNECTED_STOP_PAIRS) {
  const na = normalizeStopName(a);
  const nb = normalizeStopName(b);
  if (!na || !nb) continue;
  connectedPairKeys.add(`${na}::${nb}`);
  connectedPairKeys.add(`${nb}::${na}`);
}

function getConnectionGroup(stopName) {
  return stopToGroup.get(normalizeStopName(stopName)) || null;
}

function areConnectedStops(a, b) {
  if (!a || !b) return false;
  const normalizedA = normalizeStopName(a);
  const normalizedB = normalizeStopName(b);
  if (connectedPairKeys.has(`${normalizedA}::${normalizedB}`)) return true;
  const groupA = getConnectionGroup(a);
  const groupB = getConnectionGroup(b);
  return !!groupA && groupA === groupB;
}

module.exports = {
  CONNECTION_GROUPS,
  CONNECTED_STOP_PAIRS,
  STOP_NAME_ALIASES,
  normalizeStopName,
  getConnectionGroup,
  areConnectedStops,
};
