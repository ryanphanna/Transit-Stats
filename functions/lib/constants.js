/**
 * Constants used across SMS handlers
 */

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
