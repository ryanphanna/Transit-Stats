import { describe, expect, it } from 'vitest';
import {
    buildStopIndex,
    resolveStopLocation,
} from '../js/atlas-stop-resolver.js';

describe('Atlas stop resolver', () => {
    const atlasStop = {
        agency: 'TTC',
        code: '1234',
        name: 'College Station',
        lat: 43.66,
        lng: -79.38,
    };

    it('does not use stored coordinates when GTFS has no match', () => {
        const result = resolveStopLocation({
            agency: 'TTC',
            boardingLocation: { lat: 1, lng: 2 },
            startStopName: 'Unlisted stop',
        }, 'boarding', buildStopIndex({ atlasStops: [atlasStop] }));

        expect(result).toEqual({ source: 'unresolved', location: null });
    });

    it('uses the GTFS location and canonical name when available', () => {
        const result = resolveStopLocation({
            agency: 'TTC',
            boardingLocation: { lat: 1, lng: 2 },
            startStopCode: '1234',
            startStopName: 'College',
        }, 'boarding', buildStopIndex({ atlasStops: [atlasStop] }));

        expect(result).toEqual({
            source: 'atlas',
            label: 'College Station',
            location: { lat: 43.66, lng: -79.38 },
        });
    });

    it('prefers Atlas over a conflicting Firestore stop', () => {
        const index = buildStopIndex({
            atlasStops: [atlasStop],
            firestoreStops: [{
                agency: 'TTC',
                code: '1234',
                name: 'College Station',
                lat: 9,
                lng: 9,
            }],
        });

        const result = resolveStopLocation({ agency: 'TTC', startStopCode: '1234' }, 'boarding', index);
        expect(result.source).toBe('atlas');
        expect(result.location).toEqual({ lat: 43.66, lng: -79.38 });
    });

    it('does not use Firestore stop records', () => {
        const index = buildStopIndex({
            firestoreStops: [{
                agency: 'TTC',
                name: 'College / Beverley',
                aliases: ['College Beverley'],
                lat: 43.65,
                lng: -79.4,
            }],
        });

        const result = resolveStopLocation({ agency: 'TTC', startStopName: 'College Beverley' }, 'boarding', index);
        expect(result).toEqual({ source: 'unresolved', location: null });
    });

    it('reports unresolved stop text without throwing', () => {
        const result = resolveStopLocation({ agency: 'TTC', startStopName: 'Unknown stop' }, 'boarding', new Map());
        expect(result).toEqual({ source: 'unresolved', location: null });
    });
});
