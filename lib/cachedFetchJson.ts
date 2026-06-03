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

export async function cachedFetchJson<T>(url: string): Promise<T> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.at <= CACHED_FETCH_TTL_MS) {
    return hit.data as T;
  }
  if (hit) cache.delete(url);

  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;

  const p = fetch(url, { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
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

  inflight.set(url, p);
  return p;
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
