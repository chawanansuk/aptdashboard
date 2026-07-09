"use client";

import { useEffect, useState } from "react";
import type { Vehicle } from "@/types";
import { roomKey } from "@/lib/taskKey";

/**
 * Tiny hook: fetch /api/vehicles once on mount and return a count map
 * keyed by `${building}|${room}`. Used by RoomsView to render a
 * `🏍 N` badge on each RoomCard that has registered vehicles.
 *
 * Why a separate hook (not bundled into useDashboardData):
 *   - Vehicle data is independent — adding/removing a bike doesn't
 *     invalidate rooms/tasks, so a shared refresh tick is wasteful
 *   - The hook stays small + testable
 *   - Pages that don't need vehicle counts (e.g. /maintenance) skip the fetch
 *
 * Refresh strategy:
 *   - Initial fetch on mount
 *   - `bump()` exposed for callers to re-fetch (e.g. after add/delete
 *     via AddVehicleModal). Vehicles page itself manages its own state;
 *     this hook is for surfaces that only DISPLAY counts.
 */

export interface VehicleCountMap {
  get: (building: string, room: string) => number;
  /** Trigger a re-fetch. Useful after add/delete in another surface. */
  refresh: () => void;
  /** True until the first fetch resolves. UI uses this to avoid
   *  flashing 0s before data arrives. */
  loading: boolean;
}

export function useVehicleCountByRoom(enabled: boolean = true): VehicleCountMap {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Deferred start: the page passes enabled=false until the critical
    // dashboard data (rooms+tasks) lands, so this secondary fetch doesn't
    // compete with it for the first (possibly cold) Apps Script slot.
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/vehicles", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rows = (data?.rows || []) as Vehicle[];
        const map = new Map<string, number>();
        for (const v of rows) {
          const k = roomKey(v.building, v.room);
          map.set(k, (map.get(k) ?? 0) + 1);
        }
        setCounts(map);
      })
      .catch(() => {
        // Silent fail — pages still render, just without vehicle badges.
        if (!cancelled) setCounts(new Map());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [enabled, tick]);

  return {
    get: (building, room) => counts.get(roomKey(building, room)) ?? 0,
    refresh: () => setTick((t) => t + 1),
    loading,
  };
}
