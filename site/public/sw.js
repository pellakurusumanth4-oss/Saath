// Saath's service worker: the page comes from the network (kept for a weak signal); files come from the cache and are refreshed behind.
const CACHE = 'saath-v3'; // v3: install fills the cache with the map page; v2: / is the home page now, so the map kept under / in v1 must go
const PAGES = ['/', '/visit/', '/owner/'];
// Install fetches the map page and the files it names, so the first tap on "I'm exploring" doesn't pay a cold load.
// A failed precache only means that cold load: install goes on regardless.
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then(async (cache) => {
  const page = await fetch('/visit/', { cache: 'no-cache' });
  if (!page.ok || page.redirected) return;
  const files = [...new Set((await page.clone().text()).match(/\/assets\/[^"]+/g))];
  // The map's own code loads lazily, so the page doesn't name it: its entry script does.
  const entry = files.find((file) => /\/assets\/visit-[\w-]+\.js$/.test(file));
  const lazy = entry ? (await (await fetch(entry)).text()).match(/assets\/(?:MapView|mapStyle|ShopPage)-[\w-]+\.(?:js|css)/g) ?? [] : [];
  await cache.addAll([...new Set([...files, ...lazy.map((file) => `/${file}`)])]);
  await cache.put('/visit/', page);
}).catch(() => {}).then(() => self.skipWaiting())));
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
