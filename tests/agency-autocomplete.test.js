// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createAgencyAutocomplete } from '../js/agency-autocomplete.js';

describe('agency autocomplete', () => {
    it('matches Toronto while preserving TTC as the stored value', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        const autocomplete = createAgencyAutocomplete({
            input,
            options: [{ value: 'TTC', label: 'Toronto Transit Commission' }],
        });

        input.value = 'Toronto';
        input.dispatchEvent(new Event('input'));

        expect(document.querySelector('.agency-autocomplete-option strong')?.textContent)
            .toBe('Toronto Transit Commission');

        autocomplete.setValue('TTC');
        expect(input.value).toBe('Toronto Transit Commission');
        expect(autocomplete.getValue()).toBe('TTC');
    });
});
