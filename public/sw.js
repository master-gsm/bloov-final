const CACHE_NAME = 'bloov-accounting-v5';

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
  if (NEVER_CACHE.some(function(pattern) { return urlStr.includes(pattern); })) return true;
  if (url.pathname === '/' || url.pathname === '/index.html') return true;
  if (NEVER_CACHE_EXTENSIONS.some(function(ext) { return url.pathname.endsWith(ext); })) return true;
  return false;
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(['/']);
    }).catch(function() {})
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  var url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (shouldNeverCache(url)) return;

  var isAsset = /\.(js|css|woff2?|png|jpg|jpeg|svg|ico|webp|avif)(\?.*)?$/.test(url.pathname);

  if (isAsset) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        var networkFetch = fetch(event.request).then(function(response) {
          if (response && response.status === 200 && response.type === 'basic') {
            var cloned = response.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, cloned); });
          }
          return response;
        }).catch(function() {
          return cached;
        });

        return cached || networkFetch;
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request).then(function(cached) {
        return cached || caches.match('/');
      });
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
