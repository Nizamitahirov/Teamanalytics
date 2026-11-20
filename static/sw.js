// Service worker (SPEC §6.11): YALNIZ statik aktivlər keşlənir — API heç vaxt (data IndexedDB-dədir, ADR-002).
// Naviqasiya: əvvəl şəbəkə, offline olduqda keşlənmiş tətbiq qabığı (son data ilə yalnız oxuma + növbə).
// /legacy/ (köhnə versiya) toxunulmur.
const VERSION = 'wfp-sw-1';
const SHELL = '/';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.add(SHELL))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/legacy')) return;
  // Hash-li aktivlər dəyişmir — əvvəl keş
  if (url.pathname.startsWith('/assets/') || /\.(png|svg|woff2|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }
  // Tətbiq səhifələri (SPA): şəbəkə, offline → qabıq
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL)),
    );
  }
});
