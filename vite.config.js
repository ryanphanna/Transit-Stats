
import { defineConfig } from 'vite';

export default defineConfig({
    root: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: './index.html',
                public: './public.html',
                admin: './admin.html',
                presto: './presto.html',
            },
        },
    },
    server: {
        port: 3000,
        open: false,
    },
    optimizeDeps: {
        exclude: ['firebase', '@firebase/app', '@firebase/auth', '@firebase/firestore', '@firebase/component', '@firebase/app-compat', '@firebase/auth-compat', '@firebase/firestore-compat']
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests/setup.js'],
    },
});
