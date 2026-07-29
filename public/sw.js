const CACHE_NAME = 'chant-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.svg',
  '/src/main.jsx',
  '/src/App.jsx',
  '/src/index.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => {
        // Assets might be bundled differently in production, so catch any errors silently during development
        console.log('Skipped some cache assets: ', err);
      });
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Do not intercept API requests
  if (e.request.url.includes('/api/')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
