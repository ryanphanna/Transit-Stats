import { describe, expect, it } from 'vitest';
import { clipFeatureToTrip, routeMatches, sliceLineByFractions } from '../js/route-segment.js';

describe('route segment clipping', () => {
    const line = [[0, 0], [10, 0], [20, 0]];

    it('clips a geometry between normalized positions', () => {
        expect(sliceLineByFractions(line, 0.25, 0.75)).toEqual([
            [0, 5],
            [0, 10],
            [0, 15],
        ]);
    });

    it('matches branch routes to their Atlas base route', () => {
        expect(routeMatches('510', '510A')).toBe(true);
        expect(routeMatches('29', '929')).toBe(false);
    });

    it('uses Atlas stop positions to clip only the ridden portion', () => {
        const feature = {
            geometry: { type: 'LineString', coordinates: line },
            properties: {
                stopOrder: ['start', 'middle', 'end'],
                stopPositions: [0.1, 0.5, 0.9],
            },
        };
        expect(clipFeatureToTrip(feature, {
            startStopCode: 'start',
            endStopCode: 'end',
        }, { lat: 0, lng: 1 }, { lat: 0, lng: 19 })).toEqual([
            [0, 2],
            [0, 10],
            [0, 18],
        ]);
    });

    it('does not produce a path when the trip runs backward on a shape', () => {
        const feature = {
            geometry: { type: 'LineString', coordinates: line },
            properties: {
                stopOrder: ['start', 'end'],
                stopPositions: [0.1, 0.9],
            },
        };
        expect(clipFeatureToTrip(feature, {
            startStopCode: 'end',
            endStopCode: 'start',
        }, { lat: 0, lng: 19 }, { lat: 0, lng: 1 })).toBeNull();
    });
});
