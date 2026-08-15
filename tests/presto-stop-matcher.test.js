import { describe, expect, it } from 'vitest';
import {
    matchPrestoRecord,
    matchPrestoRecords,
    resolvePrestoStopLocation,
} from '../js/presto-stop-matcher.js';

const baseRecord = {
    agency: 'TTC',
    location: 'Bloor St East at Parliament St',
    locationLabel: 'Bloor St East at Parliament St',
};

describe('PRESTO stop matcher', () => {
    it('matches a unique canonical name or alias', () => {
        const result = matchPrestoRecord({
            ...baseRecord,
            location: 'Toronto- New USBT',
            locationLabel: 'Union Station Bus Terminal',
            agency: 'GO',
        }, [{
            id: 'bus-terminal',
            agency: 'GO Transit',
            name: 'Union Station Bus Terminal',
            code: '102300',
            lat: 43.644,
            lng: -79.377,
        }]);

        expect(result.status).toBe('matched');
        expect(result.candidate.code).toBe('102300');
    });

    it('preserves opposite-direction candidates as ambiguous', () => {
        const stops = [
            { id: 'east', agency: 'TTC', name: baseRecord.location, code: '482', direction: 'Eastbound', lat: 43.6717, lng: -79.3715 },
            { id: 'west', agency: 'TTC', name: baseRecord.location, code: '483', direction: 'Westbound', lat: 43.6722, lng: -79.3707 },
        ];
        const result = matchPrestoRecord(baseRecord, stops);

        expect(result.status).toBe('ambiguous');
        expect(result.candidates.map(candidate => candidate.direction)).toEqual(['Eastbound', 'Westbound']);
        expect(resolvePrestoStopLocation(baseRecord, stops)).toEqual({
            source: 'unresolved',
            location: null,
            matchStatus: 'ambiguous',
            candidates: result.candidates,
        });
    });

    it('does not match a label from another agency', () => {
        const result = matchPrestoRecord({ ...baseRecord, agency: 'GO' }, [{
            agency: 'TTC',
            name: baseRecord.location,
            lat: 43.67,
            lng: -79.37,
        }]);

        expect(result).toEqual({ status: 'unmatched', candidates: [] });
    });

    it('summarizes matched, ambiguous, and unmatched records', () => {
        const result = matchPrestoRecords([
            baseRecord,
            { ...baseRecord, location: 'Unknown', locationLabel: 'Unknown' },
        ], [{ agency: 'TTC', name: baseRecord.location, code: '482', lat: 43.67, lng: -79.37 }]);

        expect(result.counts).toEqual({ matched: 1, ambiguous: 0, unmatched: 1 });
        expect(result.results).toHaveLength(2);
    });
});
