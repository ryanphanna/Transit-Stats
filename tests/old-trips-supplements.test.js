import { describe, expect, it } from 'vitest';
import { OLD_TRIPS_GTFS_STOP_SUPPLEMENTS } from '../js/old-trips-gtfs-supplements.js';
import { buildStopIndex, resolveStopLocation } from '../js/atlas-stop-resolver.js';

const stops = Object.entries(OLD_TRIPS_GTFS_STOP_SUPPLEMENTS)
    .flatMap(([agency, rows]) => rows.map(stop => ({ ...stop, agency })));

describe('Old Trips GTFS supplements', () => {
    const index = buildStopIndex({ atlasStops: stops });

    it('contains the exact local-GTFS batch', () => {
        expect(Object.keys(OLD_TRIPS_GTFS_STOP_SUPPLEMENTS).length).toBe(31);
        expect(stops.length).toBe(441);
    });

    it('resolves imported raw labels without changing trip records', () => {
        const match = resolveStopLocation({
            agency: 'King County Metro',
            startStopName: 'Shoreline South / 148th',
        }, 'boarding', index);

        expect(match.label).toBe('Shoreline South/148th Station');
        expect(match.location).toEqual({ lat: 47.73609, lng: -122.325265 });
    });
});
