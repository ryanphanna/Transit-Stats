const {
  toTitleCase,
  escapeXml,
  normalizeDirection,
  normalizeRoute,
  isValidRoute,
  getStopDisplay,
  getRouteDisplay,
} = require('../functions/lib/utils');

// ---------------------------------------------------------------------------
// toTitleCase
// ---------------------------------------------------------------------------

describe('toTitleCase', () => {
  test('falsy input is returned as-is', () => {
    expect(toTitleCase('')).toBe('');
    expect(toTitleCase(null)).toBeNull();
    expect(toTitleCase(undefined)).toBeUndefined();
  });

  test('basic title casing', () => {
    expect(toTitleCase('queen street')).toBe('Queen Street');
    expect(toTitleCase('DUNDAS WEST')).toBe('Dundas West');
  });

  test('"and" is normalized to "&"', () => {
    expect(toTitleCase('queen and spadina')).toBe('Queen & Spadina');
    expect(toTitleCase('QUEEN AND SPADINA')).toBe('Queen & Spadina');
  });

  test('slashes are normalized (spaces around slash removed)', () => {
    expect(toTitleCase('Spadina / Nassau')).toBe('Spadina/Nassau');
    expect(toTitleCase('spadina/nassau')).toBe('Spadina/Nassau');
  });

  test('each part of a slash-separated name is capitalized', () => {
    expect(toTitleCase('yonge/king')).toBe('Yonge/King');
  });

  test('extra spaces between words are collapsed', () => {
    expect(toTitleCase('Queen  St')).toBe('Queen St');
  });
});

// ---------------------------------------------------------------------------
// escapeXml
// ---------------------------------------------------------------------------

describe('escapeXml', () => {
  test('escapes ampersand', () => {
    expect(escapeXml('a & b')).toBe('a &amp; b');
  });

  test('escapes less-than and greater-than', () => {
    expect(escapeXml('<tag>')).toBe('&lt;tag&gt;');
  });

  test('escapes double quotes', () => {
    expect(escapeXml('"hello"')).toBe('&quot;hello&quot;');
  });

  test('escapes single quotes', () => {
    expect(escapeXml("it's")).toBe('it&apos;s');
  });

  test('plain text is unchanged', () => {
    expect(escapeXml('hello world')).toBe('hello world');
  });

  test('escapes all special chars in one string', () => {
    expect(escapeXml('<a href="x&y">it\'s</a>')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;it&apos;s&lt;/a&gt;');
  });
});

// ---------------------------------------------------------------------------
// normalizeDirection
// ---------------------------------------------------------------------------

describe('normalizeDirection', () => {
  test('null/empty returns null', () => {
    expect(normalizeDirection(null)).toBeNull();
    expect(normalizeDirection('')).toBeNull();
  });

  test('northbound abbreviations', () => {
    for (const input of ['N', 'NB', 'N/B', 'North', 'NORTHBOUND', 'northward']) {
      expect(normalizeDirection(input)).toBe('Northbound');
    }
  });

  test('southbound abbreviations', () => {
    for (const input of ['S', 'SB', 'S/B', 'South', 'SOUTHBOUND', 'southward']) {
      expect(normalizeDirection(input)).toBe('Southbound');
    }
  });

  test('eastbound abbreviations', () => {
    for (const input of ['E', 'EB', 'E/B', 'East', 'EASTBOUND', 'eastward']) {
      expect(normalizeDirection(input)).toBe('Eastbound');
    }
  });

  test('westbound abbreviations', () => {
    for (const input of ['W', 'WB', 'W/B', 'West', 'WESTBOUND', 'westward']) {
      expect(normalizeDirection(input)).toBe('Westbound');
    }
  });

  test('clockwise and counterclockwise', () => {
    expect(normalizeDirection('CW')).toBe('Clockwise');
    expect(normalizeDirection('CCW')).toBe('Counterclockwise');
    expect(normalizeDirection('anticlockwise')).toBe('Counterclockwise');
    expect(normalizeDirection('anti-clockwise')).toBe('Counterclockwise');
  });

  test('inbound and outbound', () => {
    expect(normalizeDirection('IB')).toBe('Inbound');
    expect(normalizeDirection('IN')).toBe('Inbound');
    expect(normalizeDirection('OB')).toBe('Outbound');
    expect(normalizeDirection('OUT')).toBe('Outbound');
  });

  test('unrecognized input is returned trimmed as-is', () => {
    expect(normalizeDirection('  Platform 2  ')).toBe('Platform 2');
    expect(normalizeDirection('Downtown')).toBe('Downtown');
  });
});

// ---------------------------------------------------------------------------
// normalizeRoute
// ---------------------------------------------------------------------------

describe('normalizeRoute', () => {
  test('falsy input is returned as-is', () => {
    expect(normalizeRoute(null)).toBeNull();
    expect(normalizeRoute(undefined)).toBeUndefined();
  });

  test('numeric routes are unchanged', () => {
    expect(normalizeRoute('501')).toBe('501');
  });

  test('trailing lowercase letter is uppercased', () => {
    expect(normalizeRoute('510a')).toBe('510A');
    expect(normalizeRoute('7b')).toBe('7B');
  });

  test('trailing uppercase letter is unchanged', () => {
    expect(normalizeRoute('510A')).toBe('510A');
  });

  test('leading/trailing whitespace is trimmed', () => {
    expect(normalizeRoute('  501  ')).toBe('501');
  });
});

// ---------------------------------------------------------------------------
// isValidRoute
// ---------------------------------------------------------------------------

describe('isValidRoute', () => {
  test('falsy input is invalid', () => {
    expect(isValidRoute(null)).toBe(false);
    expect(isValidRoute('')).toBe(false);
    expect(isValidRoute(undefined)).toBe(false);
  });

  test('pure numeric routes are valid', () => {
    expect(isValidRoute('501')).toBe(true);
    expect(isValidRoute('7')).toBe(true);
  });

  test('bad suffix strings are invalid', () => {
    expect(isValidRoute('ST')).toBe(false);
    expect(isValidRoute('NB')).toBe(false);
    expect(isValidRoute('BUS')).toBe(false);
    expect(isValidRoute('STOP')).toBe(false);
    expect(isValidRoute('NORTHBOUND')).toBe(false);
  });

  test('alphanumeric route codes are valid', () => {
    expect(isValidRoute('510A')).toBe(true);
    expect(isValidRoute('GO1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getStopDisplay
// ---------------------------------------------------------------------------

describe('getStopDisplay', () => {
  test('stopCode takes priority', () => {
    expect(getStopDisplay('14202', 'Queen St', 'old')).toBe('14202');
  });

  test('stopName is used when no stopCode', () => {
    expect(getStopDisplay(null, 'queen st', null)).toBe('Queen St');
  });

  test('legacyStop is used as last fallback', () => {
    expect(getStopDisplay(null, null, 'union station')).toBe('Union Station');
  });

  test('returns "Unknown" when all fields are null', () => {
    expect(getStopDisplay(null, null, null)).toBe('Unknown');
  });
});

// ---------------------------------------------------------------------------
// getRouteDisplay
// ---------------------------------------------------------------------------

describe('getRouteDisplay', () => {
  test('basic route with no direction', () => {
    expect(getRouteDisplay('501')).toBe('501');
  });

  test('route with direction', () => {
    expect(getRouteDisplay('501', 'Southbound')).toBe('501 Southbound');
  });

  test('trailing lowercase letter in route is uppercased', () => {
    expect(getRouteDisplay('510a')).toBe('510A');
  });

  test('numeric route as number type is handled', () => {
    expect(getRouteDisplay(501)).toBe('501');
  });
});
