import { describe, expect, it } from 'vitest';
import { Stats } from '../js/stats.js';

describe('Stats.computeTripPeriodCounts', () => {
    it('counts lifetime, last 30 days, and last 7 days', () => {
        const now = new Date(2026, 7, 13, 12); // Thursday, August 13, 2026
        const trips = [
            { startTime: new Date(2026, 7, 13, 8) },
            { startTime: new Date(2026, 7, 10, 8) },
            { startTime: new Date(2026, 7, 1, 8) },
            { startTime: new Date(2026, 6, 13, 8) },
            { startTime: new Date(2026, 7, 9, 8) },
            { startTime: new Date(2026, 7, 6, 11) }
        ];

        expect(Stats.computeTripPeriodCounts(trips, now)).toEqual({
            lifetime: 6,
            thisMonth: 5,
            thisWeek: 3,
            daysRidden: 6
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
            thisWeek: 1,
            daysRidden: 1
        });
    });

    it('counts multiple trips on the same day once', () => {
        const trips = [
            { startTime: new Date(2026, 7, 13, 8) },
            { startTime: new Date(2026, 7, 13, 17) },
            { startTime: new Date(2026, 7, 14, 8) }
        ];

        expect(Stats.computeTripPeriodCounts(trips, new Date(2026, 7, 14, 12)).daysRidden).toBe(2);
    });
});
