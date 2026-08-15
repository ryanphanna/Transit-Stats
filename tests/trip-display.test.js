import { describe, expect, test } from 'vitest';
import { getTripRouteLabel, getTripStatusLabel, getTripStopLabel } from '../js/trip-display.js';

describe('trip display fallbacks', () => {
    test('never renders undefined stop values', () => {
        expect(getTripStopLabel({ startStopName: undefined }, 'boarding')).toBe('No boarding stop recorded');
        expect(getTripStopLabel({ endStopName: undefined }, 'exiting')).toBe('No exit recorded');
    });

    test('uses a clear exit fallback for incomplete trips', () => {
        const trip = { incomplete: true, startStopName: 'Spadina Station' };
        expect(getTripStopLabel(trip, 'exiting')).toBe('Trip ended early');
        expect(getTripStatusLabel(trip)).toBe('Incomplete');
    });

    test('does not repeat placeholder stop labels', () => {
        expect(getTripStopLabel({ startStopName: 'Unknown Boarding Stop' }, 'boarding'))
            .toBe('No boarding stop recorded');
        expect(getTripStopLabel({ incomplete: true, endStopName: 'Incomplete Trip' }, 'exiting'))
            .toBe('Trip ended early');
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

    test('uses a canonical label from a normalized stop source', () => {
        expect(getTripStopLabel(
            { startStopName: 'York Mills' },
            'boarding',
            { source: 'firestore', label: 'York Mills Station' },
        )).toBe('York Mills Station');
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

    test('replaces an incomplete route placeholder with clear wording', () => {
        expect(getTripRouteLabel({ incomplete: true, route: 'Incomplete Trip' })).toBe('Trip ended early');
    });
});
