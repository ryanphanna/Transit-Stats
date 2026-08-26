/* Keep the product on its single light visual system before the page paints. */
(function applySavedTheme() {
    function apply() {
        document.documentElement.dataset.theme = 'light';
        document.documentElement.dataset.themePreference = 'light';
        document.body?.classList.remove('dark');
        return 'light';
    }

    window.TransitTheme = {
        getPreference: () => 'light',
        apply() {
            return apply();
        },
        resolve: () => 'light',
    };

    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.themePreference = 'light';
    if (document.body) apply();
    else document.addEventListener('DOMContentLoaded', () => apply(), { once: true });
})();
