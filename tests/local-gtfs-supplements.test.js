import { describe, expect, it } from 'vitest';
import { LOCAL_GTFS_STOP_SUPPLEMENTS } from '../js/local-gtfs-stop-supplements.js';
import { buildStopIndex, resolveStopLocation } from '../js/atlas-stop-resolver.js';

const supplementStops = Object.entries(LOCAL_GTFS_STOP_SUPPLEMENTS)
    .flatMap(([agency, stops]) => stops.map(stop => ({ ...stop, agency })));

describe('local GTFS stop supplements', () => {
    const index = buildStopIndex({ atlasStops: supplementStops });

    it('maps the Flagship ferry endpoints to local GTFS coordinates', () => {
        expect(resolveStopLocation({
            agency: 'Flagship Cruises & Events',
            startStopName: 'Coronado Ferry Landing',
        }, 'boarding', index).location).toEqual({ lat: 32.699209, lng: -117.16972 });
        expect(resolveStopLocation({
            agency: 'Flagship Cruises & Events',
            endStopName: 'Broadway Pier',
        }, 'exiting', index).location).toEqual({ lat: 32.716038, lng: -117.173407 });
    });

    it('maps rider wording to canonical local GTFS names', () => {
        const result = resolveStopLocation({
            agency: 'LA Metro',
            startStopName: 'Wiltshire / Normandie',
        }, 'boarding', index);

        expect(result.label).toBe('Wilshire / Normandie');
        expect(result.match).toBe('exact');
    });

    it('matches source-verified cross-agency aliases without changing trip agencies', () => {
        const hsrResult = resolveStopLocation({
            agency: 'HSR',
            startStopName: 'Exhibition Loop / 13366',
        }, 'boarding', index);
        const ttcResult = resolveStopLocation({
            agency: 'TTC',
            endStopName: 'Brickworks',
        }, 'exiting', index);

        expect(hsrResult.label).toBe('Exhibition Loop at Manitoba Dr');
        expect(ttcResult.label).toBe('550 Bayview Ave - Evergreen Brick Works');
    });

    it('matches exact GTFS codes when the raw stop name is missing', () => {
        const result = resolveStopLocation({
            agency: 'HSR',
            startStopCode: '9225',
        }, 'boarding', index);

        expect(result.label).toBe('JAMES at REBECCA');
        expect(result.location).toEqual({ lat: 43.2583, lng: -79.86825 });
    });
});
