/**
 * TransitStats - Triple Emoji Identity System
 * Maps emojis to keywords for unique, URL-safe usernames.
 */
export const Identity = {
    LIBRARY: {
        // --- Transit ---
        'bus': '🚌', 'train': '🚆', 'subway': '🚇', 'streetcar': '🚋', 'lightrail': '🚈',
        'rocket': '🚀', 'bike': '🚲', 'scooter': '🛴', 'walk': '🚶', 'ferry': '🚢',
        'station': '🚉', 'map': '🗺️', 'ticket': '🎫', 'stop': '🛑', 'bridge': '🌉',
        'cablecar': '🚠', 'helicopter': '🚁', 'airplane': '✈️', 'sailing': '⛵', 'taxi': '🚕',
        'truck': '🚚', 'anchor': '⚓', 'fuel': '⛽', 'traffic': '🚥', 'auto': '🚗',
        'monorail': '🚝', 'bullettrain': '🚅', 'tram': '🚊', 'minibus': '🚐', 'motorcycle': '🏍️',
        'scooter2': '🛵', 'busstop': '🚏', 'motorway': '🛣️', 'tracks': '🛤️',
        'v_traffic': '🚦', 'construction': '🚧', 'rowboat': '🚣', 'speedboat': '🚤', 'ship2': '🛳️',
        'departure': '🛫', 'arrival': '🛬', 'aerialtram': '🚡', 'mountainrail': '🚞',
        
        // --- Animals ---
        'panda': '🐼', 'fox': '🦊', 'koala': '🐨', 'lion': '🦁', 'tiger': '🐯',
        'frog': '🐸', 'octopus': '🐙', 'butterfly': '🦋', 'owl': '🦉', 'dino': '🦖',
        'whale': '🐋', 'crab': '🦀', 'bee': '🐝', 'cat': '🐱', 'dog': '🐶',
        
        // --- Food ---
        'taco': '🌮', 'pizza': '🍕', 'burger': '🍔', 'ramen': '🍜', 'sushi': '🍣',
        'icecream': '🍦', 'donut': '🍩', 'coffee': '☕', 'beer': '🍺', 'apple': '🍎',
        'cookie': '🍪', 'cake': '🍰', 'bread': '🍞', 'pretzel': '🥨', 'avocado': '🥑',
        
        // --- Sports & Hobby ---
        'soccer': '⚽', 'basketball': '🏀', 'baseball': '⚾', 'tennis': '🎾', 'volleyball': '🏐',
        'football': '🏈', 'pool': '🎱', 'pingpong': '🏓', 'skate': '🛹', 'surf': '🏄',
        'cycle': '🚴', 'climb': '🧗', 'game': '🎮', 'guitar': '🎸', 'camera': '📷',
        
        // --- Nature & Objects ---
        'tree': '🌳', 'cactus': '🌵', 'flower': '🌻', 'moon': '🌙', 'sun': '☀️',
        'cloud': '☁️', 'fire': '🔥', 'star': '⭐', 'mountain': '⛰️', 'ocean': '🌊',
        'crystal': '🔮', 'robot': '🤖', 'alien': '👽', 'ghost': '👻', 'heart': '❤️',
        'gift': '🎁', 'crown': '👑', 'gem': '💎', 'key': '🔑', 'lock': '🔒'
    },

    /**
     * Generate a random triplet (ensuring 3 unique keys)
     */
    generate() {
        const keys = Object.keys(this.LIBRARY);
        const triplet = [];
        const used = new Set();
        
        while (triplet.length < 3) {
            const key = keys[Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000 * keys.length)];
            if (!used.has(key)) {
                triplet.push(key);
                used.add(key);
            }
        }
        return triplet;
    },

    /**
     * Convert slug (bus_taco_panda) to emojis (🚌🌮🐼)
     */
    toEmojis(slug) {
        if (!slug) return '';
        return slug.split('_')
            .map(key => this.LIBRARY[key] || '')
            .join('');
    },

    /**
     * Convert array of keys to slug
     */
    toSlug(keys) {
        return keys.join('_');
    },

    /**
     * Get all available emojis for a picker
     */
    getLibrary() {
        return Object.entries(this.LIBRARY).map(([key, emoji]) => ({ key, emoji }));
    }
};
