/**
 * Verification Script for Prediction Logic
 * Compares mock historical data against test cases.
 */

import { PredictionEngine } from '../js/predict.js';

const mockHistory = [
    { route: 'Line 1', startStop: 'King Station', startTime: new Date('2026-03-02T08:00:00') }, // Monday
    { route: 'Line 1', startStop: 'King Station', startTime: new Date('2026-03-03T08:15:00') }, // Tuesday
    { route: 'Line 1', startStop: 'King Station', startTime: new Date('2026-03-04T07:55:00') }, // Wednesday
    { route: '504 King', startStop: 'Spadina Ave', startTime: new Date('2026-03-04T08:45:00'), endStop: 'King Station' },
];

const testCases = [
    {
        name: 'Morning Commute Match',
        context: { time: new Date('2026-03-07T08:05:00'), lat: null, lng: null }, // Saturday morning (Time match, but day mismatch)
        expectedRoute: 'Line 1'
    },
    {
        name: 'Sequence Transition Match',
        context: {
            time: new Date('2026-03-07T08:50:00'),
            lat: null, lng: null,
            // Mocking a "last trip" that just ended at Spadina
            lastTrip: { endStop: 'Spadina Ave', endTime: new Date('2026-03-07T08:45:00') }
        },
        expectedRoute: '504 King'
    }
];

console.log('--- Starting Prediction Engine Verification ---');

testCases.forEach(tc => {
    // Note: The simple script doesn't have the internal _getLastRecentTrip fully mocked via context, 
    // but the engine uses it internally from history. 
    // In our test, we'll manually ensure history contains the transition.

    // We'll wrap history to simulate the 'now' properly
    const result = PredictionEngine.guess(mockHistory, tc.context);

    if (result && result.route === tc.expectedRoute) {
        console.log(`✅ [PASS] ${tc.name}: Predicted ${result.route} (Confidence: ${result.confidence}%)`);
    } else {
        console.log(`❌ [FAIL] ${tc.name}: Predicted ${result ? result.route : 'None'} (Expected: ${tc.expectedRoute})`);
    }
});

console.log('--- Verification Complete ---');
