const { aggregateTripStats } = require('../functions/lib/gemini');

describe('Gemini aggregateTripStats', () => {
  const mockTrips = [
    {
      route: '501',
      startStopName: 'Union',
      endStopName: 'King',
      startTime: new Date('2026-03-20T08:00:00Z'),
      duration: 10,
    },
    {
      route: '501',
      startStopName: 'Union',
      endStopName: 'King',
      startTime: new Date('2026-03-21T08:05:00Z'),
      duration: 12,
    },
    {
      route: '510',
      startStopName: 'Spadina',
      endStopName: 'Dundas',
      startTime: new Date('2026-03-22T15:00:00Z'),
      duration: 20,
    },
  ];

  test('calculates basic stats correctly', () => {
    const stats = aggregateTripStats(mockTrips);
    expect(stats.total).toBe(3);
    expect(stats.routeStats).toHaveLength(2);
    expect(stats.routeStats[0].route).toBe('501');
    expect(stats.routeStats[0].count).toBe(2);
  });

  test('calculates boarding/exit stop counts', () => {
    const stats = aggregateTripStats(mockTrips);
    expect(stats.boardingStops).toContainEqual({ stop: 'Union', count: 2 });
    expect(stats.boardingStops).toContainEqual({ stop: 'Spadina', count: 1 });
    expect(stats.exitStops).toContainEqual({ stop: 'King', count: 2 });
  });

  test('groups by time of day', () => {
    // Note: getHours() is local. If machine is Toronto time (EDT -4),
    // 08:00Z -> 04:00 (Night), 15:00Z -> 11:00 (Midday)
    const stats = aggregateTripStats(mockTrips);
    const total = stats.timeOfDay.morning + stats.timeOfDay.midday + stats.timeOfDay.afternoon +
                  stats.timeOfDay.evening + stats.timeOfDay.night;
    expect(total).toBe(3);
  });

  test('generates daily trip counts', () => {
    const stats = aggregateTripStats(mockTrips);
    // Note: timeZone is fixed to Toronto in code
    expect(stats.dailyCounts['2026-03-20']).toBe(1);
    expect(stats.dailyCounts['2026-03-21']).toBe(1);
    expect(stats.dailyCounts['2026-03-22']).toBe(1);
  });

  test('includes full stop list', () => {
    const stats = aggregateTripStats(mockTrips);
    expect(stats.allStops).toContain('Union');
    expect(stats.allStops).toContain('King');
    expect(stats.allStops).toContain('Spadina');
    expect(stats.allStops).toContain('Dundas');
    expect(stats.allStops).toHaveLength(4);
  });

  test('handles trips without duration', () => {
    const trip = { route: '501', startStopName: 'Union', startTime: new Date() };
    const stats = aggregateTripStats([trip]);
    expect(stats.total).toBe(1);
    expect(stats.routeStats[0].avgDuration).toBeNull();
  });

  test('handles incomplete trip fields', () => {
    const trip = { startTime: null }; // No route, no stop
    const stats = aggregateTripStats([trip]);
    expect(stats.total).toBe(1);
    expect(stats.routeStats[0].route).toBe('Unknown');
    expect(stats.routeStats).toHaveLength(1);
  });
});
