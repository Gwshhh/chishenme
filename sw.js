/* Keep each installed shell coherent; update only after the user accepts. */
importScripts('./sw-assets.js');
const scope = self.registration.scope;
const prefix = 'chishenme:' + new URL(scope).pathname + ':';
const SHELL = prefix + self.APP_VERSION;
const IMAGES = prefix + 'images-v1';
const core = new Set(self.APP_ASSETS.map(asset => new URL(asset, scope).pathname));

self.addEventListener('install', event => {
    event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(self.APP_ASSETS.map(asset => new Request(new URL(asset, scope), { cache: 'reload' })))));
});
self.addEventListener('message', event => {
    if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const name of await caches.keys()) {
            if (name.startsWith(prefix) && name !== SHELL && name !== IMAGES) await caches.delete(name);
            // Legacy releases used one unscoped key. Only remove it if it belongs to this app path.
            if (/^chishenme-v\d+$/.test(name)) {
                const cache = await caches.open(name);
                if (await cache.match(new URL('index.html', scope))) await caches.delete(name);
            }
        }
        await self.clients.claim();
    })());
});
self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (core.has(url.pathname)) {
        event.respondWith((async () => {
            const cache = await caches.open(SHELL);
            const hit = await cache.match(request, { ignoreSearch: true });
            if (hit) return hit;
            try { return await fetch(request); }
            catch { return new Response('Offline resource unavailable', { status: 503 }); }
        })());
        return;
    }
    const imagePrefix = new URL('images_food/', scope).pathname;
    if (url.pathname.startsWith(imagePrefix)) {
        event.respondWith((async () => {
            const cache = await caches.open(IMAGES);
            const hit = await cache.match(request);
            if (hit) return hit;
            try {
                const response = await fetch(request);
                if (response.ok) {
                    const copy = response.clone();
                    event.waitUntil((async () => {
                        try {
                            await cache.put(request, copy);
                            const keys = await cache.keys();
                            await Promise.all(keys.slice(0, Math.max(0, keys.length - 120)).map(key => cache.delete(key)));
                        } catch { /* Quota limits never break a successful image response. */ }
                    })());
                }
                return response;
            } catch { return new Response('', { status: 503 }); }
        })());
    }
    // Personal data, runtime configuration and API responses are not cached.
});