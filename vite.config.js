
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
                rocket: './Tools/Rocket/index.html',
            },
        },
    },
    server: {
        port: 4000,
        open: false,
    },
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
