/* Apartment Dashboard service worker
 * Strategy:
 *  - POST / non-GET: pass-through, never cache (writes go directly to Apps Script)
 *  - /api/sheet*  GET : network-first, fallback to cache (offline read)
 *  - HTML page navigations : network-first, fallback to cache. Keeps the
 *    app from lagging a deploy behind — fresh HTML references the latest
 *    hashed JS chunks, so a code fix shows up on the next open, not the one
 *    after. (stale-while-revalidate here meant users were always 1 version
 *    behind.)
 *  - Other same-origin GET (hashed /_next/static, css, images) :
 *    stale-while-revalidate — these are content-hashed/immutable so a stale
 *    hit is always correct.
 *  - Other origins: pass-through
 */
const CACHE_VERSION = "ac-v5";
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== RUNTIME_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never cache writes

  const url = new URL(req.url);

  // Cross-origin: pass-through
  if (url.origin !== self.location.origin) return;

  // Auth flows: never cache, never intercept (let middleware/server handle redirects)
  if (
    url.pathname.startsWith("/api/auth") ||
    url.pathname === "/login" ||
    url.pathname.startsWith("/login/")
  ) {
    return;
  }

  // API: network-first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }

  // HTML page navigations: network-first so a new deploy applies on the next
  // open (no version lag), falling back to cache when offline.
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
    return;
  }

  // Static assets (hashed /_next/static, css, images): stale-while-revalidate
  if (url.pathname.startsWith("/_next/data/")) return; // pass-through
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-From-Cache", "1");
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    if (req.mode === "navigate") {
      return new Response("offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(
      JSON.stringify({ error: "offline และไม่มีข้อมูลใน cache" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || new Response("offline", { status: 503 });
}
