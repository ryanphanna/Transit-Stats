import { describe, expect, it } from 'vitest';
import { heatmapRouteStyle, summarizeGtfsRouteUsage } from '../js/gtfs-heatmap.js';

describe('GTFS route heatmap data', () => {
    const features = [
        { __agencySlug: 'hamilton', properties: { routeShortName: '1A' }, geometry: { type: 'LineString', coordinates: [] } },
        { __agencySlug: 'hamilton', properties: { routeShortName: '1' }, geometry: { type: 'LineString', coordinates: [] } },
        { __agencySlug: 'ttc', properties: { routeShortName: '510' }, geometry: { type: 'LineString', coordinates: [] } },
    ];

    it('joins trip counts to GTFS route families by agency', () => {
        const result = summarizeGtfsRouteUsage(features, [
            { agency: 'HSR', route: '1A' },
            { agency: 'HSR', route: '1' },
            { agency: 'TTC', route: '510B' },
            { agency: 'TTC', route: '29' },
            { agency: 'HSR', route: '1', discarded: true },
        ], { hamilton: 'HSR', ttc: 'TTC' });

        expect(result.totalRides).toBe(4);
        expect(result.riddenRoutes).toBe(2);
        expect(result.maxRides).toBe(2);
        expect(result.routes[0].rides).toBe(2);
        expect(result.routes[2].rides).toBe(1);
    });

    it('uses a quiet style for GTFS corridors with no recorded rides', () => {
        expect(heatmapRouteStyle(0, 4)).toMatchObject({ color: '#94a3b8', weight: 1.5, opacity: 0.2 });
        expect(heatmapRouteStyle(4, 4).weight).toBe(8);
    });
});
