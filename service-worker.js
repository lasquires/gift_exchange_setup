const CACHE = 'gather-give-v2';
const ASSETS = ['./', './index.html', './styles.css', './src/app.js', './src/engine.js', './favicon.svg', './manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) { const cloned = response.clone(); caches.open(CACHE).then(cache => cache.put(request, cloned)); }
    return response;
  }).catch(() => caches.match(request).then(hit => hit || caches.match('./index.html'))));
});
