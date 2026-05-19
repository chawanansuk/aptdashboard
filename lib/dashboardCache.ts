/**
 * In-memory dashboard cache with Stale-While-Revalidate (SWR) semantics.
 *
 * Phase 2 — split into two independent slots so that
 * `/api/dashboard/rooms` and `/api/dashboard/tasks` can be served and
 * revalidated independently. The slow upstream source (Apps Script
 * tasks) no longer blocks the fast one (CSV rooms).
 *
 * Lives in module scope, so it persists across requests served by the
 * same warm Vercel function instance (typically 5-15 min on Vercel).
 *
 * Three states per slot:
 *   fresh (≤ FRESH_TTL_MS)         → return as-is, no revalidation
 *   stale (> FRESH, ≤ STALE_TTL)   → return immediately + revalidate
 *                                    in background (caller schedules it)
 *   expired (> STALE_TTL_MS)       → null, caller must do a full fetch
 *
 * Writes (`/api/sheet/update`) call `invalidateDashboardCache()` so
 * subsequent reads do a fresh upstream fetch immediately. This wipes
 * BOTH slots so the next read of either endpoint reloads.
 */

import type { RoomRow, SheetRow } from "@/types";

export type CacheState = "fresh" | "stale" | "missing";

export interface CacheLookup<T> {
  state: CacheState;
  data: T | null;
  ageMs: number;
}

/** Returned as-is, no revalidation triggered. */
export const FRESH_TTL_MS = 60_000;
/** Returned with background revalidation. */
export const STALE_TTL_MS = 5 * 60_000;

/**
 * Generic SWR slot. Each upstream source (rooms, tasks) gets its own
 * instance. Single-flight guard is per-slot so that a stalled background
 * refresh of one source doesn't block revalidation of the other.
 */
class SwrSlot<T> {
  private value: T | null = null;
  private savedAt = 0;
  private revalidating = false;

  get(now: number = Date.now()): CacheLookup<T> {
    if (this.value === null) return { state: "missing", data: null, ageMs: 0 };
    const ageMs = now - this.savedAt;
    if (ageMs <= FRESH_TTL_MS) return { state: "fresh", data: this.value, ageMs };
    if (ageMs <= STALE_TTL_MS) return { state: "stale", data: this.value, ageMs };
    // Beyond stale TTL — expire so it can be GC'd.
    this.value = null;
    return { state: "missing", data: null, ageMs };
  }

  set(v: T, now: number = Date.now()): void {
    this.value = v;
    this.savedAt = now;
  }

  invalidate(): void {
    this.value = null;
    this.savedAt = 0;
  }

  tryBeginRevalidation(): boolean {
    if (this.revalidating) return false;
    this.revalidating = true;
    return true;
  }

  endRevalidation(): void {
    this.revalidating = false;
  }
}

const roomsSlot = new SwrSlot<RoomRow[]>();
const tasksSlot = new SwrSlot<SheetRow[]>();

/* ====================================================================
 * Per-slice API (used by the split endpoints)
 * ==================================================================== */

export function getRoomsCacheState(now?: number): CacheLookup<RoomRow[]> {
  return roomsSlot.get(now);
}
export function setRoomsCache(rooms: RoomRow[]): void {
  roomsSlot.set(rooms);
}
export function invalidateRoomsCache(): void {
  roomsSlot.invalidate();
}
export function tryBeginRoomsRevalidation(): boolean {
  return roomsSlot.tryBeginRevalidation();
}
export function endRoomsRevalidation(): void {
  roomsSlot.endRevalidation();
}

export function getTasksCacheState(now?: number): CacheLookup<SheetRow[]> {
  return tasksSlot.get(now);
}
export function setTasksCache(tasks: SheetRow[]): void {
  tasksSlot.set(tasks);
}
export function invalidateTasksCache(): void {
  tasksSlot.invalidate();
}
export function tryBeginTasksRevalidation(): boolean {
  return tasksSlot.tryBeginRevalidation();
}
export function endTasksRevalidation(): void {
  tasksSlot.endRevalidation();
}

/* ====================================================================
 * Combined API (legacy /api/dashboard endpoint)
 *
 * Combined state is derived from both slots:
 *   fresh   — both slots fresh
 *   stale   — both slots have data, at least one stale
 *   missing — at least one slot is missing
 * ==================================================================== */

interface CombinedCached {
  rooms: RoomRow[];
  tasks: SheetRow[];
  savedAt: number;
}

export function getDashboardCacheState(now: number = Date.now()): CacheLookup<CombinedCached> {
  const r = roomsSlot.get(now);
  const t = tasksSlot.get(now);
  if (!r.data || !t.data) {
    return { state: "missing", data: null, ageMs: Math.max(r.ageMs, t.ageMs) };
  }
  const ageMs = Math.max(r.ageMs, t.ageMs);
  const state: CacheState =
    r.state === "fresh" && t.state === "fresh"
      ? "fresh"
      : "stale";
  return {
    state,
    data: { rooms: r.data, tasks: t.data, savedAt: now - ageMs },
    ageMs,
  };
}

/** Legacy: returns the combined cache only when fresh. */
export function getDashboardCache(): CombinedCached | null {
  const { state, data } = getDashboardCacheState();
  return state === "fresh" ? data : null;
}

export function setDashboardCache(rooms: RoomRow[], tasks: SheetRow[]): void {
  const now = Date.now();
  roomsSlot.set(rooms, now);
  tasksSlot.set(tasks, now);
}

/** Wipes BOTH slots — called on writes to ensure read-after-write consistency. */
export function invalidateDashboardCache(): void {
  roomsSlot.invalidate();
  tasksSlot.invalidate();
}

/**
 * Combined single-flight guard for the legacy endpoint. Independent of
 * per-slot guards (which protect the split endpoints).
 */
let combinedRevalidating = false;
export function tryBeginRevalidation(): boolean {
  if (combinedRevalidating) return false;
  combinedRevalidating = true;
  return true;
}
export function endRevalidation(): void {
  combinedRevalidating = false;
}
