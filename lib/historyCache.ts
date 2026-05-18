/**
 * Per-room history cache (localStorage on the client).
 * Server cache lives in Apps Script (60s) so we keep client cache short
 * — just enough to avoid re-fetch when user toggles between tabs.
 */

"use client";

import type { RoomHistoryEntry } from "@/types";

const KEY_PREFIX = "roomHistory:v1:";
const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedEntry {
  rows: RoomHistoryEntry[];
  savedAt: number;
}

function key(building: string, room: string): string {
  return KEY_PREFIX + (building || "").trim() + "|" + (room || "").trim();
}

export function loadHistoryCache(building: string, room: string): RoomHistoryEntry[] | null {
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

export function saveHistoryCache(building: string, room: string, rows: RoomHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    const data: CachedEntry = { rows, savedAt: Date.now() };
    localStorage.setItem(key(building, room), JSON.stringify(data));
  } catch {
    // quota exceeded — ignore
  }
}

export function invalidateHistoryCache(building: string, room: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key(building, room));
  } catch {
    // ignore
  }
}
