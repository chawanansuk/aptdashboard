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
