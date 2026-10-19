// Saath's service worker: the page comes from the network (kept for a weak signal); files come from the cache and are refreshed behind.
const CACHE = 'saath-v2'; // v2: / is the home page now, so the map kept under / in v1 must go
const PAGES = ['/', '/visit/', '/owner/'];
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Only this site's own GETs. Supabase, map tiles, fonts and the Android app's /ar/ and /talk/ pages go straight to the network.
  if (request.method !== 'GET' || url.origin !== location.origin || /^\/(ar|talk)\//.test(url.pathname)) return;
  if (request.mode === 'navigate') {
    const page = url.pathname.replace(/index\.html$/, '');
    if (!PAGES.includes(page)) return;
    event.respondWith(fetch(request).then((response) => {
      if (response.status === 200) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(page, copy)); }
      return response;
    }).catch(() => caches.match(page).then((hit) => hit || Response.error())));
    return;
  }
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(request);
    const fresh = fetch(request).then((response) => {
      if (response.status === 200) cache.put(request, response.clone());
      return response;
    });
    if (!hit) return fresh;
    fresh.catch(() => {});
    return hit;
  }));
});
