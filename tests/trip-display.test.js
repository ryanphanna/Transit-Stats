import { describe, expect, test } from 'vitest';
import { getTripRouteLabel, getTripStatusLabel, getTripStopLabel } from '../js/trip-display.js';

describe('trip display fallbacks', () => {
    test('never renders undefined stop values', () => {
        expect(getTripStopLabel({ startStopName: undefined }, 'boarding')).toBe('Unknown boarding stop');
        expect(getTripStopLabel({ endStopName: undefined }, 'exiting')).toBe('Unknown exit stop');
    });

    test('uses incomplete status instead of pending exit copy', () => {
        const trip = { incomplete: true, startStopName: 'Spadina Station' };
        expect(getTripStopLabel(trip, 'exiting')).toBe('Incomplete trip');
        expect(getTripStatusLabel(trip)).toBe('Incomplete');
    });

    test('uses the resolved stop name when the trip text is missing', () => {
        expect(getTripStopLabel({}, 'boarding', { source: 'atlas', label: 'College Station' })).toBe('College Station');
        expect(getTripStopLabel({}, 'boarding', { source: 'saved' })).toBe('Saved stop location');
    });

    test('accepts legacy and newer stop fields', () => {
        expect(getTripStopLabel({ boardingStopName: 'College Station' }, 'boarding')).toBe('College Station');
        expect(getTripStopLabel({ exitingStop: 'Dundas Station' }, 'exiting')).toBe('Dundas Station');
    });

    test('uses a safe route fallback', () => {
        expect(getTripRouteLabel({ route: '  510  '})).toBe('510');
        expect(getTripRouteLabel({ route: undefined })).toBe('Unknown route');
    });
});
