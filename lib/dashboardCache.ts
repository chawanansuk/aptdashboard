/**
 * In-memory dashboard cache with Stale-While-Revalidate (SWR) semantics.
 *
 * Lives in module scope, so it persists across requests served by the
 * same warm Vercel function instance (typically 5-15 min on Vercel).
 * Cold starts and load-balanced spawns get their own cache — that's
 * fine, the upstream Apps Script `getTasksCached_` (60s) catches those.
 *
 * Three states:
 *   fresh (≤ FRESH_TTL_MS)         → return as-is, no revalidation
 *   stale (> FRESH, ≤ STALE_TTL)   → return immediately + revalidate
 *                                    in background (caller schedules it)
 *   expired (> STALE_TTL_MS)       → null, caller must do a full fetch
 *
 * Writes (`/api/sheet/update`) call `invalidateDashboardCache()` so
 * subsequent reads do a fresh upstream fetch immediately.
 */

import type { RoomRow, SheetRow } from "@/types";

interface Cached {
  rooms: RoomRow[];
  tasks: SheetRow[];
  savedAt: number;
}

export type CacheState = "fresh" | "stale" | "missing";

export interface CacheLookup {
  state: CacheState;
  data: Cached | null;
  ageMs: number;
}

let CACHE: Cached | null = null;
/** Returned as-is, no revalidation triggered. */
export const FRESH_TTL_MS = 60_000;
/** Returned with background revalidation. */
export const STALE_TTL_MS = 5 * 60_000;

/**
 * Tristate lookup that callers can use to implement SWR:
 *   "fresh"   → return now, done
 *   "stale"   → return now AND fire-and-forget a revalidation
 *   "missing" → must do a synchronous upstream fetch
 */
export function getDashboardCacheState(now: number = Date.now()): CacheLookup {
  if (!CACHE) return { state: "missing", data: null, ageMs: 0 };
  const ageMs = now - CACHE.savedAt;
  if (ageMs <= FRESH_TTL_MS) return { state: "fresh", data: CACHE, ageMs };
  if (ageMs <= STALE_TTL_MS) return { state: "stale", data: CACHE, ageMs };
  // Beyond stale TTL — expire the slot so it can be GC'd.
  CACHE = null;
  return { state: "missing", data: null, ageMs };
}

/** Legacy: returns the cache only when fresh (matches old behaviour). */
export function getDashboardCache(): Cached | null {
  const { state, data } = getDashboardCacheState();
  return state === "fresh" ? data : null;
}

export function setDashboardCache(rooms: RoomRow[], tasks: SheetRow[]): void {
  CACHE = { rooms, tasks, savedAt: Date.now() };
}

export function invalidateDashboardCache(): void {
  CACHE = null;
}

/**
 * Single-flight guard for background revalidation. While `true`, callers
 * skip kicking off another revalidation — the in-flight one will refresh
 * the cache when it lands.
 */
let revalidating = false;
export function tryBeginRevalidation(): boolean {
  if (revalidating) return false;
  revalidating = true;
  return true;
}
export function endRevalidation(): void {
  revalidating = false;
}
