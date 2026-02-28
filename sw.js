const CACHE = "health-pwa-v1.2";
const ASSETS = [
  "./",
  "./index.html",
  "./stats.html",
  "./categories.html",
  "./styles.css",
  "./app.js",
  "./stats.js",
  "./categories.js",
  "./db.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))))
    )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});