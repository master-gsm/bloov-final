const CACHE_NAME = 'bloov-accounting-v4';

const NEVER_CACHE = [
  'supabase.co',
  '/api/',
  'functions/v1/',
];

const NEVER_CACHE_EXTENSIONS = [
  '.html',
];

function shouldNeverCache(url) {
  const urlStr = url.toString();
  if (NEVER_CACHE.some(pattern => urlStr.includes(pattern))) return true;
  if (url.pathname === '/' || url.pathname === '/index.html') return true;
  if (NEVER_CACHE_EXTENSIONS.some(ext => url.pathname.endsWith(ext))) return true;
  return false;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (shouldNeverCache(url)) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline', offline: true }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  const isAsset = url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|svg|ico)(\?.*)?$/);

  if (isAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(fetch(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC', message: 'Starting background sync' });
        });
      })
    );
  }
});
