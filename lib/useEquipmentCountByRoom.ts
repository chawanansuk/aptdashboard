"use client";

import { useEffect, useState } from "react";
import type { RoomEquipment } from "@/types";
import { cachedFetchJson, bustCachedFetch } from "@/lib/cachedFetchJson";

/**
 * Hook: fetch the all-equipment list once and return a count map
 * keyed by `building|room`. Mirrors `useVehicleCountByRoom` so the
 * two badges on RoomCard render with the same data-flow shape.
 *
 * Source endpoint is `/api/maintenance-plan` (returns full
 * RoomEquipment[] across the property) — same endpoint that the
 * Maintenance view uses. We piggyback on its cache rather than
 * adding a separate /api/equipment/all route, since the data is
 * identical.
 *
 * Silent-fail: error → empty map (page still renders, just no badge).
 */

export interface EquipmentCountMap {
  get: (building: string, room: string) => number;
  refresh: () => void;
  loading: boolean;
}

export function useEquipmentCountByRoom(): EquipmentCountMap {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cachedFetchJson<{ rows: RoomEquipment[] }>("/api/maintenance-plan")
      .then((data) => {
        if (cancelled) return;
        const rows = (data?.rows || []) as RoomEquipment[];
        const map = new Map<string, number>();
        for (const e of rows) {
          const k = `${e.building}|${e.room}`;
          map.set(k, (map.get(k) ?? 0) + 1);
        }
        setCounts(map);
      })
      .catch(() => {
        if (!cancelled) setCounts(new Map());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tick]);

  return {
    get: (building, room) => counts.get(`${building}|${room}`) ?? 0,
    refresh: () => {
      bustCachedFetch("/api/maintenance-plan");
      setTick((t) => t + 1);
    },
    loading,
  };
}
