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

    it('prefers saved trip coordinates', () => {
        const result = resolveStopLocation({
            agency: 'TTC',
            boardingLocation: { lat: 1, lng: 2 },
            startStopCode: '1234',
        }, 'boarding', buildStopIndex({ atlasStops: [atlasStop] }));

        expect(result).toEqual({
            source: 'saved',
            label: 'Stop 1234',
            location: { lat: 1, lng: 2 },
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

    it('uses Firestore as a fallback for local aliases', () => {
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
        expect(result.source).toBe('firestore');
    });

    it('reports unresolved stop text without throwing', () => {
        const result = resolveStopLocation({ agency: 'TTC', startStopName: 'Unknown stop' }, 'boarding', new Map());
        expect(result).toEqual({ source: 'unresolved', location: null });
    });
});
