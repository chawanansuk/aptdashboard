"use client";

import type { RoomRow, SheetRow } from "@/types";

const KEY = "dashboardCache:v1";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 h — drop very stale data

export interface DashboardCache {
  rooms: RoomRow[];
  tasks: SheetRow[];
  savedAt: number;
}

export function loadCache(): DashboardCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCache;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > TTL_MS) return null;
    if (!Array.isArray(parsed.rooms) || !Array.isArray(parsed.tasks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCache(rooms: RoomRow[], tasks: SheetRow[]): void {
  if (typeof window === "undefined") return;
  try {
    const data: DashboardCache = { rooms, tasks, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded or disabled storage — ignore
  }
}

/**
 * Forget the previous user's data on this device (audit r37 M3). The
 * dashboard cache and the service worker's API cache hold whatever the
 * last signed-in role was allowed to see — tenant names included for a
 * manager — and would be shown to whoever signs in next on a shared
 * phone. Called on sign-out and whenever the login page is reached
 * (a session can also end by expiring).
 */
export async function clearClientCaches(): Promise<void> {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("api-")).map((n) => caches.delete(n)));
    }
  } catch { /* no Cache Storage */ }
}
