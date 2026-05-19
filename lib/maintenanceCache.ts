/**
 * In-memory SWR cache for the cross-project equipment/maintenance list.
 *
 * Mirrors `lib/dashboardCache.ts` design (FRESH → STALE → MISSING +
 * emergency-stale fallback) but isolated to a single concern so writes to
 * room equipment don't have to know about dashboard cache internals.
 *
 * Lives in module scope → persists across requests on the same warm
 * Vercel function instance. Cold starts get a fresh slot, fine.
 *
 * Invalidated by `/api/room-equipment` POST writes — without that, an
 * engineer adding an air-con wouldn't see it for up to FRESH_TTL_MS.
 */

import type { RoomEquipment } from "@/types";

export type CacheState = "fresh" | "stale" | "missing";

export interface CacheLookup<T> {
  state: CacheState;
  data: T | null;
  ageMs: number;
}

export const FRESH_TTL_MS = 90_000;        // 90s — same as tasks
export const STALE_TTL_MS = 10 * 60_000;   // 10 min
export const EMERGENCY_STALE_TTL_MS = 60 * 60_000; // 1 hour

class SwrSlot<T> {
  private value: T | null = null;
  private savedAt = 0;
  private revalidating = false;

  get(now: number = Date.now()): CacheLookup<T> {
    if (this.value === null) return { state: "missing", data: null, ageMs: 0 };
    const ageMs = now - this.savedAt;
    if (ageMs <= FRESH_TTL_MS) return { state: "fresh", data: this.value, ageMs };
    if (ageMs <= STALE_TTL_MS) return { state: "stale", data: this.value, ageMs };
    this.value = null;
    return { state: "missing", data: null, ageMs };
  }

  peekEmergency(now: number = Date.now()): T | null {
    if (this.value === null) return null;
    if (now - this.savedAt <= EMERGENCY_STALE_TTL_MS) return this.value;
    return null;
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

const equipmentSlot = new SwrSlot<RoomEquipment[]>();

export function getEquipmentCacheState(now?: number): CacheLookup<RoomEquipment[]> {
  return equipmentSlot.get(now);
}
export function setEquipmentCache(rows: RoomEquipment[]): void {
  equipmentSlot.set(rows);
}
export function invalidateEquipmentCacheServer(): void {
  equipmentSlot.invalidate();
}
export function tryBeginEquipmentRevalidation(): boolean {
  return equipmentSlot.tryBeginRevalidation();
}
export function endEquipmentRevalidation(): void {
  equipmentSlot.endRevalidation();
}
export function peekEmergencyEquipmentCache(now?: number): RoomEquipment[] | null {
  return equipmentSlot.peekEmergency(now);
}
