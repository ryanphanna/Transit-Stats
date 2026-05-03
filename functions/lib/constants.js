/**
 * Constants used across SMS handlers
 */

// Maps any recognized alias (lowercase) to the canonical stored agency name.
// Anything not in this map is stored as-is (title-cased by the parser).
exports.AGENCY_CANONICAL = {
  // TTC
  'ttc': 'TTC',
  'toronto transit commission': 'TTC',
  // GO
  'go': 'GO Transit',
  'go transit': 'GO Transit',
  // MiWay
  'miway': 'MiWay',
  'mississauga transit': 'MiWay',
  // YRT
  'yrt': 'YRT',
  'york region transit': 'YRT',
  // OC Transpo
  'oc transpo': 'OC Transpo',
  'octranspo': 'OC Transpo',
  // Brampton Transit
  'brampton transit': 'Brampton Transit',
  // Durham Transit
  'durham transit': 'Durham Transit',
  // HSR
  'hsr': 'HSR',
  'hamilton street railway': 'HSR',
  // GRT
  'grt': 'GRT',
  'grand river transit': 'GRT',
  // STM
  'stm': 'STM',
  // TransLink
  'translink': 'TransLink',
  // NYC MTA
  'nyc mta': 'NYC MTA',
  'mta nyc': 'NYC MTA',
  'new york mta': 'NYC MTA',
  // LA Metro
  'la metro': 'LA Metro',
  'lametro': 'LA Metro',
  // 'metro' and 'mta' intentionally omitted — ambiguous across cities
  // LADOT
  'ladot': 'LADOT',
  // Big Blue Bus
  'big blue bus': 'Big Blue Bus',
  'bbb': 'Big Blue Bus',
  // BART
  'bart': 'BART',
  'bay area rapid transit': 'BART',
  // Muni
  'muni': 'Muni',
  'sf muni': 'Muni',
  'sfmuni': 'Muni',
  'sfmta': 'Muni',
  // Caltrain
  'caltrain': 'Caltrain',
  // VTA
  'vta': 'VTA',
  // AC Transit
  'ac transit': 'AC Transit',
  'actransit': 'AC Transit',
  // SamTrans
  'samtrans': 'SamTrans',
  // MTS (San Diego)
  'mts': 'MTS',
  'sd mts': 'MTS',
  'san diego mts': 'MTS',
  'sdmts': 'MTS',
  // LADOT variants
  'la dot': 'LADOT',
  // Amtrak
  'amtrak': 'Amtrak',
  // Golden Gate Transit
  'golden gate transit': 'Golden Gate Transit',
  'ggt': 'Golden Gate Transit',
  // SMART
  'smart': 'SMART',
  // Santa Rosa CityBus
  'santa rosa citybus': 'Santa Rosa CityBus',
  'citybus': 'Santa Rosa CityBus',
  'srcitybus': 'Santa Rosa CityBus',
};

exports.KNOWN_AGENCIES = [
  'TTC',
  'OC Transpo',
  'GO Transit',
  'GO',
  'MiWay',
  'YRT',
  'Brampton Transit',
  'Durham Transit',
  'HSR',
  'GRT',
  'STM',
  'TransLink',
  // LA
  'LA Metro',
  'LAMETRO',
  'NYC MTA',
  'LADOT',
  'Big Blue Bus',
  // SF Bay Area
  'BART',
  'Muni',
  'SF Muni',
  'SFMUNI',
  'SFMTA',
  'Caltrain',
  'VTA',
  'AC Transit',
  'ACTRANSIT',
  'SamTrans',
  // San Diego
  'MTS',
  'SD MTS',
  'SDMTS',
  // Other
  'Amtrak',
  'SMART',
  'Golden Gate Transit',
  'GGT',
  'LA DOT',
  'Santa Rosa CityBus',
  'CityBus',
];

exports.BAD_ROUTE_SUFFIXES = [
  'ST', 'AVE', 'RD', 'DR', 'BLVD', 'WAY', 'STATION',
  'N', 'S', 'E', 'W', 'NB', 'SB', 'EB', 'WB',
  'NORTH', 'SOUTH', 'EAST', 'WEST', 'INBOUND', 'OUTBOUND',
  'NORTHBOUND', 'SOUTHBOUND', 'EASTBOUND', 'WESTBOUND',
  'TRIP', 'RIDE', 'STOP', 'BUS', 'STREETCAR', 'TRAIN', 'SUBWAY',
  'FROM', 'TO', 'AT', 'ON', 'HEADED', 'GOING',
];

exports.VALID_INTENTS = [
  'START_TRIP', 'END_TRIP', 'DISCARD_TRIP', 'INCOMPLETE_TRIP', 'QUERY', 'OTHER',
];

exports.VALID_SENTIMENTS = ['POSITIVE', 'NEGATIVE', 'NEUTRAL'];

// Maps canonical agency name to the city/region shown in disambiguation prompts.
// When two agencies map to the same city, the agency name is shown instead.
exports.AGENCY_CITY = {
  'TTC': 'Toronto',
  'GO Transit': 'Toronto / GTA',
  'MiWay': 'Mississauga',
  'YRT': 'York Region',
  'Brampton Transit': 'Brampton',
  'Durham Transit': 'Durham Region',
  'HSR': 'Hamilton',
  'GRT': 'Waterloo Region',
  'OC Transpo': 'Ottawa',
  'STM': 'Montréal',
  'TransLink': 'Vancouver',
  'NYC MTA': 'New York City',
  'LA Metro': 'Los Angeles',
  'LADOT': 'Los Angeles',
  'Big Blue Bus': 'Santa Monica',
  'BART': 'Bay Area',
  'Muni': 'San Francisco',
  'Caltrain': 'Bay Area',
  'VTA': 'San José',
  'AC Transit': 'East Bay',
  'SamTrans': 'Peninsula',
  'MTS': 'San Diego',
  'Amtrak': 'Amtrak',
  'Golden Gate Transit': 'Marin / Sonoma',
  'SMART': 'Sonoma / Marin',
  'Santa Rosa CityBus': 'Santa Rosa',
};
