/* MikroTik Magic — hashed-asset cache only.
 *
 * Never intercept HTML navigations or API calls: a dashboard that ships
 * daily must not pin a stale document shell. Fingerprinted `/assets/*`
 * files are already immutable, so a Cache Storage copy is safe and helps
 * installed PWAs on iOS/Android when HTTP cache is evicted.
 */
const CACHE = "mm-assets-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/assets/")) return;
  if (url.pathname.endsWith(".html") || url.pathname.endsWith(".htm")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) {
        try {
          await cache.put(req, res.clone());
        } catch {
          /* quota — iOS PWAs cap Cache Storage; skip rather than fail the response */
        }
      }
      return res;
    })(),
  );
});
