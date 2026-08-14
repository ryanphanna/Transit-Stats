import { describe, expect, test } from 'vitest';
import { getTripRouteLabel, getTripStatusLabel, getTripStopLabel } from '../js/trip-display.js';

describe('trip display fallbacks', () => {
    test('never renders undefined stop values', () => {
        expect(getTripStopLabel({ startStopName: undefined }, 'boarding')).toBe('No boarding stop recorded');
        expect(getTripStopLabel({ endStopName: undefined }, 'exiting')).toBe('No exit recorded');
    });

    test('uses a clear exit fallback for incomplete trips', () => {
        const trip = { incomplete: true, startStopName: 'Spadina Station' };
        expect(getTripStopLabel(trip, 'exiting')).toBe('No exit recorded');
        expect(getTripStatusLabel(trip)).toBe('Incomplete');
    });

    test('uses the resolved stop name when the trip text is missing', () => {
        expect(getTripStopLabel({}, 'boarding', { source: 'atlas', label: 'College Station' })).toBe('College Station');
        expect(getTripStopLabel({}, 'boarding', { source: 'saved' })).toBe('Saved stop location');
    });

    test('prefers a canonical GTFS stop name over raw trip text', () => {
        expect(getTripStopLabel(
            { startStopName: 'College' },
            'boarding',
            { source: 'atlas', label: 'College Station' },
        )).toBe('College Station');
    });

    test('accepts legacy and newer stop fields', () => {
        expect(getTripStopLabel({ boardingStopName: 'College Station' }, 'boarding')).toBe('College Station');
        expect(getTripStopLabel({ exitingStop: 'Dundas Station' }, 'exiting')).toBe('Dundas Station');
    });

    test('uses a safe route fallback', () => {
        expect(getTripRouteLabel({ route: '  510  '})).toBe('510');
        expect(getTripRouteLabel({ route: undefined })).toBe('Unknown route');
    });

    test('normalizes all-caps route names for riders', () => {
        expect(getTripRouteLabel({ route: 'PURPLE' })).toBe('Purple');
        expect(getTripRouteLabel({ route: '54A' })).toBe('54A');
    });
});
