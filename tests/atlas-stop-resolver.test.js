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
            match: 'exact',
        });
    });

    it('matches rider stop text to the closest GTFS stop name', () => {
        const result = resolveStopLocation({
            agency: 'TTC',
            startStopName: 'College Station',
        }, 'boarding', buildStopIndex({ atlasStops: [
            { ...atlasStop, name: 'College Station - Northbound Platform', lat: 43.661, lng: -79.381 },
            { ...atlasStop, code: '5678', name: 'Dundas Station', lat: 43.65, lng: -79.39 },
        ] }));

        expect(result.source).toBe('atlas');
        expect(result.match).toBe('fuzzy');
        expect(result.label).toBe('College Station - Northbound Platform');
    });

    it('does not use stored trip coordinates as a map source', () => {
        const result = resolveStopLocation({
            agency: 'TTC',
            boardingLocation: { lat: 43.661, lng: -79.381 },
        }, 'boarding', buildStopIndex({ atlasStops: [
            { ...atlasStop, code: '5678', name: 'Dundas Station', lat: 43.65, lng: -79.39 },
            { ...atlasStop, name: 'College Station', lat: 43.6611, lng: -79.3811 },
        ] }));

        expect(result).toEqual({ source: 'unresolved', location: null });
    });

    it('uses only high-confidence predicted exit labels to find GTFS coordinates', () => {
        const result = resolveStopLocation({
            agency: 'TTC',
            endStopPrediction: { stop: 'College Station', confidence: 100 },
        }, 'exiting', buildStopIndex({ atlasStops: [atlasStop] }));

        expect(result).toEqual({
            source: 'atlas',
            label: 'College Station',
            location: { lat: 43.66, lng: -79.38 },
            match: 'prediction-gtfs',
            predictionConfidence: 100,
        });
    });

    it('does not use low-confidence predictions as stop data', () => {
        const result = resolveStopLocation({
            agency: 'TTC',
            endStopPrediction: { stop: 'College Station', confidence: 89 },
        }, 'exiting', buildStopIndex({ atlasStops: [atlasStop] }));

        expect(result).toEqual({ source: 'unresolved', location: null });
    });

    it('does not use one isolated high-confidence versioned prediction', () => {
        const result = resolveStopLocation({
            agency: 'TTC',
            endStopPredictionV4: { stop: 'College Station', confidence: 41 },
            endStopPredictionV5: { stop: 'College Station', confidence: 95 },
        }, 'exiting', buildStopIndex({ atlasStops: [atlasStop] }));

        expect(result).toEqual({ source: 'unresolved', location: null });
    });

    it('does not assume TTC when a trip has no agency', () => {
        const result = resolveStopLocation({ startStopName: 'College Station' }, 'boarding', buildStopIndex({
            atlasStops: [atlasStop],
        }));

        expect(result).toEqual({ source: 'unresolved', location: null });
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

    it('uses normalized-library aliases only to reach an Atlas stop', () => {
        const result = resolveStopLocation({
            agency: 'TTC',
            startStopName: 'College Station alias',
        }, 'boarding', buildStopIndex({
            atlasStops: [{ ...atlasStop, name: 'College Station', lat: 43.661, lng: -79.381 }],
            normalizedStops: [{
                agency: 'TTC',
                name: 'College Station',
                aliases: ['College Station alias'],
            }],
        }));

        expect(result.source).toBe('atlas');
        expect(result.match).toBe('normalized-alias');
        expect(result.location).toEqual({ lat: 43.661, lng: -79.381 });
    });

    it('reports unresolved stop text without throwing', () => {
        const result = resolveStopLocation({ agency: 'TTC', startStopName: 'Unknown stop' }, 'boarding', new Map());
        expect(result).toEqual({ source: 'unresolved', location: null });
    });
});
