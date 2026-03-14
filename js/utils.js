/**
 * Shared Utilities for TransitStats V2
 */

export const Utils = {
    /**
     * Normalize intersection-format stops to a canonical form.
     * "Spadina & Nassau", "spadina/nassau" → "Spadina / Nassau"
     */
    normalizeIntersectionStop(str) {
        if (!str) return str;
        const trimmed = str.trim();
        
        // Helper for proper title casing (skip small words)
        const titleCase = s => s.replace(/\b\w+/g, w =>
            ['at', 'and', 'the', 'of', 'for', 'on'].includes(w.toLowerCase())
                ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        );

        // Check for "1234 Stop Name" format
        const codePrefix = trimmed.match(/^(\d{4,6})\s+(.+)$/);
        const core = codePrefix ? codePrefix[2] : trimmed;

        // Intersection patterns: "/", "&", " at "
        const intersectionMatch = core.match(/^(.+?)\s*(?:\/|&|\bat\b)\s*(.+)$/i);
        
        if (intersectionMatch) {
            const a = titleCase(intersectionMatch[1].trim());
            const b = titleCase(intersectionMatch[2].trim());
            const intersectionPart = `${a} / ${b}`;
            return codePrefix ? `${codePrefix[1]} ${intersectionPart}` : intersectionPart;
        }

        return codePrefix ? trimmed : titleCase(trimmed);
    },

    /**
     * Simple HTML escape for safety
     */
    hide(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};
