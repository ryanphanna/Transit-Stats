import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../js/phone-fields.js';

describe('normalizePhone', () => {
    it('normalizes North American input to E.164', () => {
        expect(normalizePhone('(519) 276-9853')).toBe('+15192769853');
        expect(normalizePhone('+1 519 276 9853')).toBe('+15192769853');
    });

    it('preserves the plus prefix for other supported formats', () => {
        expect(normalizePhone('+442071234567')).toBe('+442071234567');
    });
});
