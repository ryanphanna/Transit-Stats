
import { defineConfig } from 'vite';

export default defineConfig({
    root: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: './index.html',
                public: './public.html',
                dashboard: './dashboard.html',
                routes: './routes.html',
                insights: './insights.html',
                map: './map.html',
                'beta-map': './beta-map.html',
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
                const atlasCache = new Map();
                const allowedAgencies = new Set(['ttc', 'octranspo', 'go', 'miway', 'yrt', 'brampton', 'drt', 'hamilton']);

                server.middlewares.use((req, res, next) => {
                    const url = req.url.split('?')[0];
                    const targets = ['/dashboard', '/routes', '/map', '/beta-map', '/v2', '/v2-home', '/admin', '/users', '/settings', '/insights', '/public'];
                    if (targets.includes(url)) {
                        req.url = url + '.html' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
                    }
                    next();
                });

                server.middlewares.use(async (req, res, next) => {
                    const requestUrl = new URL(req.url, 'http://localhost');
                    const match = requestUrl.pathname.match(/^\/atlas-dev\/(stops|routes)$/);
                    if (!match) {
                        next();
                        return;
                    }

                    const agency = requestUrl.searchParams.get('agency');
                    if (!allowedAgencies.has(agency)) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: 'Unsupported agency' }));
                        return;
                    }

                    try {
                        const artifact = `${agency}${match[1] === 'stops' ? '-stops' : ''}.json`;
                        let data = atlasCache.get(artifact);
                        if (!data) {
                            const response = await fetch(`https://data.transitatlas.fyi/atlas/${artifact}`);
                            if (!response.ok) throw new Error(`Atlas returned ${response.status}`);
                            data = await response.json();
                            atlasCache.set(artifact, data);
                        }

                        if (match[1] === 'routes') {
                            const routes = new Set((requestUrl.searchParams.get('routes') || '').split(',').filter(Boolean));
                            if (requestUrl.searchParams.get('all') === 'true') {
                                const routeMetadata = new Map();
                                for (const feature of data.features || []) {
                                    const props = feature.properties || {};
                                    const routeShortName = String(props.routeShortName || '').trim();
                                    if (!routeShortName || routeMetadata.has(routeShortName)) continue;
                                    routeMetadata.set(routeShortName, {
                                        routeShortName,
                                        routeLongName: String(props.routeLongName || '').trim(),
                                    });
                                }
                                data = { routes: [...routeMetadata.values()] };
                            } else {
                                data = {
                                    type: 'FeatureCollection',
                                    features: (data.features || []).filter(feature => {
                                        const props = feature.properties || {};
                                        return routes.has(String(props.routeShortName || '').trim())
                                            || routes.has(String(props.routeId || '').trim());
                                    })
                                };
                            }
                        }

                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify(data));
                    } catch (error) {
                        res.statusCode = 502;
                        res.end(JSON.stringify({ error: error.message }));
                    }
                });
            },
            transformIndexHtml() {
                return [{
                    tag: 'script',
                    attrs: { src: '/js/theme.js' },
                    injectTo: 'head-prepend',
                }];
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
        include: ['tests/**/*.test.js'],
        exclude: [
            '**/node_modules/**',
            '**/_legacy_v1/**',
            '**/dist/**',
            '**/.claude/**',
            '**/.agent/**',
            'tests/firestore.rules.test.js',
        ],
    },
});
