/**
 * In-flight + short-TTL fetch dedup for JSON endpoints (perf).
 *
 * On Overview, several hooks/components independently call the same
 * GET endpoint on mount — `/api/maintenance-plan` is fetched by
 * useMaintenanceCounts, useAssetAlertCounts, ServiceDueBanner,
 * useEquipmentCountByRoom, and MaintenanceTodaySection. With plain
 * `fetch(...)` they all fire in parallel, so a single render of the
 * Overview burns 5x the bandwidth and Apps Script quota for identical
 * data. Tab-switching makes it worse: every back-and-forth refetches.
 *
 * This helper sits one level below fetch and collapses the duplication:
 *   - In-flight Map: if a request for the same URL is mid-flight, the
 *     second caller awaits the same Promise. Five concurrent callers
 *     on the same URL → one HTTP round-trip.
 *   - 30s TTL: caches the parsed JSON so a navigation-away-and-back
 *     within the window paints from memory instead of refetching.
 *
 * Mutations bust via `bustCachedFetch(url)`.
 *
 * Safety:
 *   - Per-URL key, includes query string (so different filters cache
 *     independently).
 *   - GET-shaped only — POST/PUT/etc. should never go through this.
 *   - Error path doesn't poison cache; the rejection is re-thrown and
 *     the in-flight slot cleared so the next caller can retry.
 *   - In-memory module Map — never persists across reload, so it
 *     can't leak stale cross-session data.
 */

interface Entry { data: unknown; at: number; }

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
export const CACHED_FETCH_TTL_MS = 30_000;

export async function cachedFetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");

  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.at <= CACHED_FETCH_TTL_MS) {
    return hit.data as T;
  }
  if (hit) cache.delete(url);

  const existing = inflight.get(url);
  // `no-cache` (not `no-store`) so the browser participates in the
  // ETag/304 dance the server now does (serverSwr.serveCachedRows). A
  // matching ETag → 304 → browser HTTP cache returns the cached body
  // (~50-150KB skipped per route per cycle), without us having to track
  // ETags here. `no-store` would have stripped that path entirely.
  const p = existing ?? fetch(url, { cache: "no-cache" })
    .then(async (r) => {
      if (!r.ok) {
        // ดึงข้อความไทยจาก body ({error}) ก่อน — เดิมโชว์ "HTTP 504" ทั้งที่
        // เซิร์ฟเวอร์ส่ง "หลังบ้าน Google ตอบช้าเกินไป…" มาให้แล้ว (audit r27)
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `HTTP ${r.status}`);
      }
      return (await r.json()) as T;
    })
    .then((data) => {
      cache.set(url, { data, at: Date.now() });
      inflight.delete(url);
      return data;
    })
    .catch((e) => {
      inflight.delete(url);
      throw e;
    });

  if (!existing) inflight.set(url, p);

  // Race against the abort signal so a caller (e.g. an unmounted hook)
  // can stop awaiting, while the underlying fetch still completes and
  // populates the cache for the next caller — the inflight Map already
  // dedups across them, so canceling one mustn't poison the others.
  if (signal) return racedWithSignal(p as Promise<T>, signal);
  return p as Promise<T>;
}

function racedWithSignal<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

/** Drop a URL's cache (call after a POST/PUT mutation hitting it). */
export function bustCachedFetch(url: string): void {
  cache.delete(url);
  inflight.delete(url);
}

/** Test-only: wipe everything. */
export function _clearCachedFetch(): void {
  cache.clear();
  inflight.clear();
}
