
import { defineConfig } from 'vite';

export default defineConfig({
    root: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: './index.html',
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
