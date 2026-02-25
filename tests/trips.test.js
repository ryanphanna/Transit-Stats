
import { describe, it, expect } from 'vitest';
import { Trips } from '../js/trips.js';

describe('Trips.parseStopInput', () => {
    it('should parse a plain digit stop code', () => {
        const result = Trips.parseStopInput('1234');
        expect(result).toEqual({ stopCode: '1234', stopName: null });
    });

    it('should parse a stop name', () => {
        const result = Trips.parseStopInput('King Station');
        expect(result).toEqual({ stopCode: null, stopName: 'King Station' });
    });

    it('should parse "Name Code" format', () => {
        const result = Trips.parseStopInput('King Station 1234');
        expect(result).toEqual({ stopCode: '1234', stopName: 'King Station' });
    });

    it('should parse "Code Name" format', () => {
        const result = Trips.parseStopInput('1234 King Station');
        expect(result).toEqual({ stopCode: '1234', stopName: 'King Station' });
    });

    it('should handle whitespace', () => {
        const result = Trips.parseStopInput('  5678  Union   ');
        expect(result).toEqual({ stopCode: '5678', stopName: 'Union' });
    });

    it('should handle null/empty input', () => {
        expect(Trips.parseStopInput('')).toEqual({ stopCode: null, stopName: null });
        expect(Trips.parseStopInput(null)).toEqual({ stopCode: null, stopName: null });
    });
});
