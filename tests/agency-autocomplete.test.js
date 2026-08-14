// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
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

    it('rejects arbitrary values when custom agencies are disabled', () => {
        const input = document.createElement('input');
        const onCommit = vi.fn();
        const onInvalid = vi.fn();
        document.body.appendChild(input);
        const autocomplete = createAgencyAutocomplete({
            input,
            options: [{ value: 'TTC', label: 'Toronto Transit Commission' }],
            allowCustom: false,
            onCommit,
            onInvalid,
        });

        input.value = 'bu';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

        expect(onCommit).not.toHaveBeenCalled();
        expect(onInvalid).toHaveBeenCalledOnce();
        expect(autocomplete.getValue()).toBe('');
        expect(input.getAttribute('aria-invalid')).toBe('true');
    });
});
