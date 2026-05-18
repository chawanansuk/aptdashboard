"use client";

import type { RoomEquipment } from "@/types";

/**
 * Per-room equipment cache (client-side localStorage).
 * Apps Script already caches 60s server-side; this layer covers the
 * "user toggles modal tabs / reopens room within minutes" use case
 * without an extra request.
 */

const KEY_PREFIX = "roomEquipment:v2:";
const TTL_MS = 5 * 60 * 1000;

interface CachedEntry {
  rows: RoomEquipment[];
  savedAt: number;
}

function key(building: string, room: string): string {
  return KEY_PREFIX + (building || "").trim() + "|" + (room || "").trim();
}

export function loadEquipmentCache(building: string, room: string): RoomEquipment[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(building, room));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > TTL_MS) return null;
    if (!Array.isArray(parsed.rows)) return null;
    return parsed.rows;
  } catch {
    return null;
  }
}

export function saveEquipmentCache(building: string, room: string, rows: RoomEquipment[]): void {
  if (typeof window === "undefined") return;
  try {
    const data: CachedEntry = { rows, savedAt: Date.now() };
    localStorage.setItem(key(building, room), JSON.stringify(data));
  } catch {
    // quota exceeded — ignore
  }
}

export function invalidateEquipmentCache(building: string, room: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key(building, room));
  } catch {
    // ignore
  }
}
