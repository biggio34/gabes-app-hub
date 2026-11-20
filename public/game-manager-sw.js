const CACHE = "game-manager-shell-v1";
const SHELL = ["/apps/game-manager", "/shared/game-manager.js", "/shared/elks-data.js"];

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key.startsWith("game-manager-shell-") && key !== CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (SHELL.indexOf(url.pathname) < 0) return;
  event.respondWith(
    fetch(request)
      .then(function (response) {
        if (!response || !response.ok || response.redirected) return response;
        const copy = response.clone();
        caches.open(CACHE).then(function (cache) {
          cache.put(request, copy);
        });
        return response;
      })
      .catch(function () {
        return caches.match(request);
      }),
  );
});
