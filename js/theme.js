/* Apply the saved theme before the page paints. This file intentionally has no imports. */
(function applySavedTheme() {
    const preference = localStorage.getItem('ts_theme') || 'system';

    function resolvedTheme(value) {
        if (value === 'dark' || value === 'light') return value;
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function apply(value = preference) {
        const theme = resolvedTheme(value);
        document.documentElement.dataset.theme = theme;
        document.documentElement.dataset.themePreference = value;
        document.body?.classList.toggle('dark', theme === 'dark');
        return theme;
    }

    window.TransitTheme = {
        getPreference: () => localStorage.getItem('ts_theme') || 'system',
        apply(value) {
            const next = value || 'system';
            localStorage.setItem('ts_theme', next);
            return apply(next);
        },
        resolve: resolvedTheme,
    };

    document.documentElement.dataset.theme = resolvedTheme(preference);
    document.documentElement.dataset.themePreference = preference;
    if (document.body) apply(preference);
    else document.addEventListener('DOMContentLoaded', () => apply(preference), { once: true });

    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (window.TransitTheme.getPreference() === 'system') apply('system');
    });
})();
