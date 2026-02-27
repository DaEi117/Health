const CACHE = "health-pwa-v2";
const ASSETS = [
  "/",
  "/index.html",
  "/stats.html",
  "/categories.html",
  "/styles.css",
  "/app.js",
  "/stats.js",
  "/categories.js",
  "/db.js",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k === CACHE ? null : caches.delete(k))))
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});