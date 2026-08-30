import { describe, expect, it } from 'vitest';
import { aggregateTripCorridors, getCorridorStyle } from '../js/route-heatmap.js';

const endpoint = (agency, start, end) => ({
    trip: { agency, startStopName: 'Start', endStopName: 'End' },
    boarding: { location: start },
    exiting: { location: end },
});

describe('aggregateTripCorridors', () => {
    it('groups repeated trips while keeping agencies separate', () => {
        const corridors = aggregateTripCorridors([
            endpoint('TTC', { lat: 43.65, lng: -79.38 }, { lat: 43.66, lng: -79.39 }),
            endpoint('TTC', { lat: 43.65, lng: -79.38 }, { lat: 43.66, lng: -79.39 }),
            endpoint('York Region Transit', { lat: 43.65, lng: -79.38 }, { lat: 43.66, lng: -79.39 }),
        ]);

        expect(corridors).toHaveLength(2);
        expect(corridors[0].count).toBe(2);
        expect(corridors[0].agency).toBe('TTC');
    });

    it('leaves incomplete or invalid trips out of the lines', () => {
        expect(aggregateTripCorridors([
            endpoint('TTC', { lat: 43.65, lng: -79.38 }, null),
            endpoint('TTC', { lat: 0, lng: 0 }, { lat: 43.66, lng: -79.39 }),
            endpoint('TTC', { lat: 43.65, lng: -79.38 }, { lat: 43.65, lng: -79.38 }),
        ])).toEqual([]);
    });
});

it('makes busier corridors stronger', () => {
    const quiet = getCorridorStyle(1, 4);
    const busy = getCorridorStyle(4, 4);
    expect(busy.weight).toBeGreaterThan(quiet.weight);
    expect(busy.opacity).toBeGreaterThan(quiet.opacity);
});
