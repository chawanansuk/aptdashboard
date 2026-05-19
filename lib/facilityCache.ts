"use client";

import type { Facility } from "@/types";

/**
 * Facility list cache (client-side localStorage). All facilities are fetched
 * in one call (cross-building), so this is a single-entry cache.
 *
 * Apps Script already caches 60s server-side; this layer covers re-entry
 * to the Facilities view within a few minutes.
 */

const KEY = "facilities:v1";
const TTL_MS = 5 * 60 * 1000;

interface CachedEntry {
  rows: Facility[];
  savedAt: number;
}

export function loadFacilityCache(): Facility[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
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

export function saveFacilityCache(rows: Facility[]): void {
  if (typeof window === "undefined") return;
  try {
    const data: CachedEntry = { rows, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // quota — ignore
  }
}

export function invalidateFacilityCache(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
