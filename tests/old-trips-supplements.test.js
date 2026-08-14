import { describe, expect, it } from 'vitest';
import { OLD_TRIPS_GTFS_STOP_SUPPLEMENTS } from '../js/old-trips-gtfs-supplements.js';
import { buildStopIndex, resolveStopLocation } from '../js/atlas-stop-resolver.js';

const stops = Object.entries(OLD_TRIPS_GTFS_STOP_SUPPLEMENTS)
    .flatMap(([agency, rows]) => rows.map(stop => ({ ...stop, agency })));

describe('Old Trips GTFS supplements', () => {
    const index = buildStopIndex({ atlasStops: stops });

    it('contains the exact local-GTFS batch', () => {
        expect(Object.keys(OLD_TRIPS_GTFS_STOP_SUPPLEMENTS).length).toBe(41);
        expect(stops.length).toBe(629);
    });

    it('resolves imported raw labels without changing trip records', () => {
        const match = resolveStopLocation({
            agency: 'King County Metro',
            startStopName: 'Shoreline South / 148th',
        }, 'boarding', index);

        expect(match.label).toBe('Shoreline South/148th Station');
        expect(match.location).toEqual({ lat: 47.73609, lng: -122.325265 });
    });

    it('maps the most-used TTC station shorthand to the station location', () => {
        const match = resolveStopLocation({
            agency: 'TTC',
            startStopName: 'Sherbourne',
        }, 'boarding', index);

        expect(match.label).toBe('Sherbourne Station');
        expect(match.location).toEqual({ lat: 43.67214, lng: -79.37617 });
    });

    it('maps repeated GO and CDTA shorthand to their verified stations', () => {
        const go = resolveStopLocation({ agency: 'GO Transit', startStopName: 'Burlington' }, 'boarding', index);
        const aldershot = resolveStopLocation({ agency: 'GO Transit', startStopName: 'Aldershot' }, 'boarding', index);
        const hsr = resolveStopLocation({ agency: 'HSR', startStopName: 'Hamilton GO' }, 'boarding', index);
        const cdta = resolveStopLocation({ agency: 'CDTA', startStopName: 'North Central' }, 'boarding', index);
        const yrt = resolveStopLocation({ agency: 'YRT', startStopName: 'Finch' }, 'boarding', index);

        expect(go.label).toBe('Burlington GO');
        expect(aldershot.label).toBe('Aldershot GO');
        expect(hsr.label).toBe('HAMILTON GO CENTRE PLATFORM 17');
        expect(resolveStopLocation({ agency: 'TTC', startStopName: 'Vaughan Metropolitan Centre' }, 'boarding', index).label)
            .toBe('Vaughan Metropolitan Centre Station - Subway Platform');
        expect(resolveStopLocation({ agency: 'TTC', startStopName: 'Yorkdale' }, 'boarding', index).label)
            .toBe('Yorkdale Station - Northbound Platform');
        expect(resolveStopLocation({ agency: 'NFTA Metro', startStopName: 'Walden Galleria' }, 'boarding', index).label)
            .toBe('Walden Avenue & Galleria Mall');
        expect(resolveStopLocation({ agency: 'RTC Washoe', startStopName: '4th Street Station' }, 'boarding', index).label)
            .toBe('RTC 4TH STREET STATION');
        expect(resolveStopLocation({ agency: 'RTC Washoe', startStopName: 'Meadowwood Mall' }, 'boarding', index).label)
            .toBe('RTC Transfer Center / Meadowood Mall');
        expect(resolveStopLocation({ agency: 'RTC Washoe', startStopName: '775' }, 'boarding', index).label)
            .toBe('Glendale Avenue and S 21st Street');
        expect(resolveStopLocation({ agency: 'HSR', startStopName: 'Main / Emerson' }, 'boarding', index).label)
            .toBe('MAIN at EMERSON');
        expect(resolveStopLocation({ agency: 'Niagara Region Transit', startStopName: 'Morrison-dorchester Hub' }, 'boarding', index).label)
            .toBe('Morrison-Dorchester Hub');
        expect(cdta.label).toBe('North Central Station - River St & Glen Ave');
        expect(yrt.label).toBe('Finch GO Bus Terminal');
    });

    it('maps NFTA transportation-center shorthand to the Buffalo MTC stop', () => {
        const match = resolveStopLocation({
            agency: 'NFTA Metro',
            startStopName: 'Metropolitan Transportation Center',
        }, 'boarding', index);

        expect(match.label).toBe('Ellicott Street & MTC Static');
        expect(match.location).toEqual({ lat: 42.883406, lng: -78.872355 });
    });

    it('maps Muni Embarcadero shorthand to the metro station', () => {
        const match = resolveStopLocation({ agency: 'Muni', startStopName: 'Embarcadero' }, 'boarding', index);

        expect(match.label).toBe('Metro Embarcadero Station');
        expect(match.location).toEqual({ lat: 37.792922, lng: -122.3967905 });
    });

    it('maps TTC station shorthand to canonical station locations', () => {
        const northYork = resolveStopLocation({ agency: 'TTC', startStopName: 'North York Centre' }, 'boarding', index);
        const osgoode = resolveStopLocation({ agency: 'TTC', startStopName: 'Osgoode' }, 'boarding', index);

        expect(northYork.label).toBe('North York Centre Station');
        expect(northYork.location).toEqual({ lat: 43.767947, lng: -79.412542 });
        expect(osgoode.label).toBe('Osgoode Station');
        expect(osgoode.location).toEqual({ lat: 43.651099, lng: -79.386688 });
    });

    it('keeps obvious shorthand and typo aliases on canonical stops', () => {
        const queen = resolveStopLocation({ agency: 'TTC', startStopName: 'Queen' }, 'boarding', index);
        const spokane = resolveStopLocation({ agency: 'Spokane Transit', startStopName: 'STA Plaza' }, 'boarding', index);

        expect(queen.label).toBe('Queen Station');
        expect(spokane.label).toBe('STA Plaza');
    });
});
