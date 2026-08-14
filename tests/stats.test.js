import { describe, expect, it } from 'vitest';
import { Stats } from '../js/stats.js';

describe('Stats.computeTripPeriodCounts', () => {
    it('counts lifetime, current month, and current Monday-based week', () => {
        const now = new Date(2026, 7, 13, 12); // Thursday, August 13, 2026
        const trips = [
            { startTime: new Date(2026, 7, 13, 8) },
            { startTime: new Date(2026, 7, 10, 8) },
            { startTime: new Date(2026, 7, 1, 8) },
            { startTime: new Date(2026, 6, 31, 8) },
            { startTime: new Date(2026, 7, 9, 8) }
        ];

        expect(Stats.computeTripPeriodCounts(trips, now)).toEqual({
            lifetime: 5,
            thisMonth: 4,
            thisWeek: 2
        });
    });

    it('supports Firestore timestamps and ignores invalid dates for period counts', () => {
        const now = new Date(2026, 7, 13, 12);
        const trips = [
            { startTime: { toDate: () => new Date(2026, 7, 12, 8) } },
            { startTime: 'not a date' }
        ];

        expect(Stats.computeTripPeriodCounts(trips, now)).toEqual({
            lifetime: 2,
            thisMonth: 1,
            thisWeek: 1
        });
    });
});
