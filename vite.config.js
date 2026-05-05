
import { defineConfig } from 'vite';

export default defineConfig({
    root: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: './index.html',
                dashboard: './dashboard.html',
                insights: './insights.html',
                map: './map.html',
                admin: './admin.html',
                users: './users.html',
                settings: './settings.html',
                v2: './v2.html',
                'v2-home': './v2-home.html',
                rocket: './Tools/Rocket/index.html',
            },
        },
    },
    server: {
        port: 5176,
        open: false,
    },
    plugins: [
        {
            name: 'html-ext-fallback',
            configureServer(server) {
                server.middlewares.use((req, res, next) => {
                    const url = req.url.split('?')[0];
                    const targets = ['/dashboard', '/map', '/v2', '/v2-home', '/admin', '/users', '/settings', '/insights'];
                    if (targets.includes(url)) {
                        req.url = url + '.html' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
                    }
                    next();
                });
            }
        }
    ],
    optimizeDeps: {
        exclude: ['firebase', '@firebase/app', '@firebase/auth', '@firebase/firestore', '@firebase/component', '@firebase/app-compat', '@firebase/auth-compat', '@firebase/firestore-compat']
    },
    test: {
        globals: true,
        environment: 'jsdom',
        // setupFiles: ['./tests/setup.js'],
        exclude: ['**/node_modules/**', '**/_legacy_v1/**', '**/dist/**'],
    },
});
