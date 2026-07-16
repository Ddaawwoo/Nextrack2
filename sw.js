const CACHE_NAME = 'dawomix-v9'; // Změň verzi, pokud aktualizuješ soubory
const urlsToCache = [
    './',
    './index.html',
    './gdrive-advanced.js',
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

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
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
