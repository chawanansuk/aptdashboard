/**
 * Tiny in-memory, per-session view cache (perf — list views).
 *
 * The list views (Vehicles / Leads / Parts / Maintenance) refetch their
 * whole dataset every time the tab is mounted, so flipping between tabs
 * fires a fresh round-trip each time even if you were just there. This
 * cache lets a view paint its last result instantly and revalidate in
 * the background (SWR-style), collapsing the common "switch away and
 * back within a few seconds" case to zero perceived latency.
 *
 * Design choices that keep it safe:
 *   - In-memory only (module Map) — scoped to the browser session, so
 *     it can't serve cross-session or cross-user stale data the way a
 *     localStorage cache could. A reload clears it.
 *   - Short TTL (30s) — long enough to cover tab-switching, short
 *     enough that data edited directly in the sheet surfaces quickly.
 *   - Callers still fetch every time (SWR); the cache only seeds the
 *     initial paint. So a stale entry is corrected within one RTT.
 *   - Mutations bust their view's key explicitly, so you never see
 *     stale-after-your-own-edit.
 */

interface Entry { data: unknown; at: number; }

const store = new Map<string, Entry>();
export const VIEW_CACHE_TTL_MS = 30_000;

/** Return cached data if present and within TTL, else null (and evict
 *  the expired entry). Generic — caller asserts the shape. */
export function getCachedView<T>(key: string, now: number = Date.now()): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (now - e.at > VIEW_CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return e.data as T;
}

/** Store fresh data for a key, stamped now. */
export function setCachedView<T>(key: string, data: T, now: number = Date.now()): void {
  store.set(key, { data, at: now });
}

/** Drop a key (call after a mutation so the next read refetches). */
export function bustView(key: string): void {
  store.delete(key);
}

/** Test helper — wipe everything. */
export function _clearAllViewCache(): void {
  store.clear();
}
