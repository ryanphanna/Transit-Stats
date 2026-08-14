import { describe, expect, it } from 'vitest';
import { groupMapPoints } from '../js/map-presentation.js';

describe('groupMapPoints', () => {
    it('groups nearby saved coordinates into one weighted stop marker', () => {
        const grouped = groupMapPoints([
            { lat: 43.65321, lng: -79.38320, type: 'boarding', label: 'Union Station' },
            { lat: 43.65324, lng: -79.38318, type: 'boarding', label: 'Union Station' },
        ]);

        expect(grouped).toHaveLength(1);
        expect(grouped[0].usage).toBe(2);
    });

    it('keeps explicitly different stop identities separate', () => {
        const grouped = groupMapPoints([
            { lat: 43.65321, lng: -79.38320, type: 'boarding', key: 'ttc:union:43.6532:-79.3832' },
            { lat: 43.65321, lng: -79.38320, type: 'boarding', key: 'ttc:union-platform-2:43.6532:-79.3832' },
        ]);

        expect(grouped).toHaveLength(2);
    });
});
