/**
 * In-memory dashboard cache for the Vercel function.
 *
 * Lives in module scope, so it persists across requests served by the
 * same warm function instance (typically 5-15 min on Vercel). Cold
 * starts and load-balanced spawns get their own cache — that's fine,
 * the upstream Apps Script `getTasksCached_` (60s) catches those.
 *
 * Writes (`/api/sheet/update`) call `invalidateDashboardCache()` so
 * subsequent reads hit fresh data immediately.
 */

import type { RoomRow, SheetRow } from "@/types";

interface Cached {
  rooms: RoomRow[];
  tasks: SheetRow[];
  savedAt: number;
}

let CACHE: Cached | null = null;
const TTL_MS = 20_000;

export function getDashboardCache(): Cached | null {
  if (!CACHE) return null;
  if (Date.now() - CACHE.savedAt > TTL_MS) {
    CACHE = null;
    return null;
  }
  return CACHE;
}

export function setDashboardCache(rooms: RoomRow[], tasks: SheetRow[]): void {
  CACHE = { rooms, tasks, savedAt: Date.now() };
}

export function invalidateDashboardCache(): void {
  CACHE = null;
}
