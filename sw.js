const CACHE_NAME = 'dawomix-v12'; // Změň verzi, pokud aktualizuješ soubory
const urlsToCache = [
    './',
    './index.html',
    './gdrive-advanced.js',
    './dropbox-advanced.js',
    './manifest.json',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
    './logo.png',
    './source.png',
    './mega.png',
    './googledrive.png',
    './dropbox.png',
    './settings.png'
];

// Instalace Service Workeru a uložení souborů do cache
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache byla otevřena');
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

// Zachytávání požadavků: HTML vždy zkusí nejdřív síť, assety mohou zůstat cache-first.
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    const isStaticAsset = ['script', 'style', 'image', 'font'].includes(event.request.destination);
    if (!isStaticAsset) return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const networkResponse = fetch(event.request).then(response => {
                if (response.ok || response.type === 'opaque') {
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                }
                return response;
            }).catch(() => cachedResponse);
            return cachedResponse || networkResponse;
        })
    );
});

// Mazání starých verzí cache při aktivaci nového Service Workeru
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(cacheNames.map(cacheName => {
                    if (CACHE_NAME !== cacheName) return caches.delete(cacheName);
                }));
            })
            .then(() => self.clients.claim())
    );
});
