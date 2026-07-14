import { describe, test, expect } from 'vitest';
import { _lookupStopInTopology } from '../functions/lib/db/stops';

describe('_lookupStopInTopology', () => {
  test('matches a canonical topology stop on the correct route', () => {
    const match = _lookupStopInTopology('Davisville', 'TTC', '1');
    expect(match).not.toBeNull();
    expect(match.stopName).toBe('Davisville');
    expect(match.source).toBe('topology');
    expect(match.topologyMatched).toBe(true);
  });

  test('matches a topology alias on the correct route', () => {
    const match = _lookupStopInTopology('Spadina Station', 'TTC', '2');
    expect(match).not.toBeNull();
    expect(match.stopName).toBe('Spadina');
  });

  test('preserves exact direction-specific topology platform names', () => {
    const match = _lookupStopInTopology('Spadina Ave at Nassau St South Side', 'TTC', '510');
    expect(match).not.toBeNull();
    expect(match.stopName).toBe('Spadina Ave at Nassau St South Side');
  });

  test('does not match a stop on the wrong route', () => {
    const match = _lookupStopInTopology('Davisville', 'TTC', '2');
    expect(match).toBeNull();
  });
});
