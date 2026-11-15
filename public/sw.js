// Journey Buddy service worker: lets the app open with no signal (common on rural routes).
//   - The app page: network first, falling back to the saved copy.
//   - The timetable: network first, falling back to the last one that loaded.
//   - Stop photos: saved the first time they're seen (their ids never change).
// Bump VERSION when the caching rules change.

const VERSION = "v1";
const CACHE = `journey-buddy-${VERSION}`;
const SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("journey-buddy-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/admin/")) return; // never cache staff data

  if (url.pathname === "/api/timetable") return event.respondWith(networkFirst(req));
  if (url.pathname.startsWith("/api/images/")) return event.respondWith(cacheFirst(req));
  if (req.mode === "navigate") {
    return event.respondWith(networkFirst(req).catch(() => caches.match("/index.html")));
  }
});
