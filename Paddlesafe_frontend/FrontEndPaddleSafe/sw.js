const CACHE_NAME = "paddlesafe-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json",
  "/splash-android.png",
  "/splash-ios.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
