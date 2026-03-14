
import { describe, it, expect } from 'vitest';
import { Stats } from '../js/stats.js';

describe('Stats.calculateStreaks', () => {
    it('should return 0 for empty trips', () => {
        const result = Stats.calculateStreaks([]);
        expect(result).toEqual({ current: 0, best: 0 });
    });

    it('should calculate a 3-day streak correctly', () => {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        const dayBefore = new Date();
        dayBefore.setDate(today.getDate() - 2);

        const trips = [
            { startTime: { toDate: () => today } },
            { startTime: { toDate: () => yesterday } },
            { startTime: { toDate: () => dayBefore } }
        ];

        const result = Stats.calculateStreaks(trips);
        expect(result.current).toBe(3);
        expect(result.best).toBe(3);
    });

    it('should identify a broken streak', () => {
        const today = new Date();
        const fourDaysAgo = new Date();
        fourDaysAgo.setDate(today.getDate() - 4);

        const trips = [
            { startTime: { toDate: () => today } },
            { startTime: { toDate: () => fourDaysAgo } }
        ];

        const result = Stats.calculateStreaks(trips);
        expect(result.current).toBe(1);
        expect(result.best).toBe(1);
    });

    it('should handle inactive streaks', () => {
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        const sixDaysAgo = new Date();
        sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

        const trips = [
            { startTime: { toDate: () => fiveDaysAgo } },
            { startTime: { toDate: () => sixDaysAgo } }
        ];

        const result = Stats.calculateStreaks(trips);
        expect(result.current).toBe(0);
        expect(result.best).toBe(2);
    });
});
