"use client";

import { useEffect, useState } from "react";
import type { Part, RoomEquipment } from "@/types";
import { isLowStock } from "@/types";
import { getMaintenanceStatus } from "@/lib/maintenanceUtils";
import { cachedFetchJson, bustCachedFetch } from "@/lib/cachedFetchJson";
import { subscribeBus } from "@/lib/realtimeBus";

/**
 * Aggregate counts for the engineer-side sidebar badges:
 *   - lowStockParts: parts with stock ≤ threshold (threshold > 0)
 *   - overdueEquipment: equipment past its service interval
 *
 * Both source endpoints (`/api/parts`, `/api/maintenance-plan`) are
 * already deduped + 30s-cached via `cachedFetchJson` and shared with the
 * other Overview hooks, so this hook adds no extra round-trip — it counts
 * from the same cached copy.
 *
 * Silent-fail: if either endpoint errors, that count stays 0 (sidebar
 * just shows no badge — no crash, no warning toast).
 *
 * Skipped entirely when `enabled = false` (e.g. sales role can't see
 * /api/parts or /api/maintenance-plan; no point fetching).
 *
 * Live refresh: the badge used to set once on mount and then go stale
 * until a full page reload — an engineer adjusting stock or closing a
 * maintenance task saw the badge keep its old number. Two triggers keep
 * it current now (mirrors useDashboardData):
 *   - cross-tab writes via the realtime bus (instant)
 *   - a visibility-aware 60s poll as the same-tab catch-all
 */

export interface AssetAlertCounts {
  lowStockParts: number;
  overdueEquipment: number;
  loading: boolean;
}

const PARTS_URL = "/api/parts";
const PLAN_URL = "/api/maintenance-plan";

export function useAssetAlertCounts(enabled: boolean): AssetAlertCounts {
  const [counts, setCounts] = useState<AssetAlertCounts>({
    lowStockParts: 0,
    overdueEquipment: 0,
    loading: enabled,
  });
  // Bumped to force a refetch — by the 60s poll and by cross-tab writes.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCounts({ lowStockParts: 0, overdueEquipment: 0, loading: false });
      return;
    }
    let cancelled = false;
    // Only show the loading state on the first load; background refetches
    // (poll / bus) swap the numbers in place without a flicker.
    if (tick === 0) setCounts((c) => ({ ...c, loading: true }));

    Promise.all([
      cachedFetchJson<{ rows: Part[] }>(PARTS_URL).catch(() => ({ rows: [] as Part[] })),
      cachedFetchJson<{ rows: RoomEquipment[] }>(PLAN_URL).catch(() => ({ rows: [] as RoomEquipment[] })),
    ]).then(([partsRes, eqRes]) => {
      if (cancelled) return;
      const parts = (partsRes?.rows || []) as Part[];
      const equipment = (eqRes?.rows || []) as RoomEquipment[];
      const lowStockParts = parts.filter(isLowStock).length;
      const overdueEquipment = equipment.filter(
        (e) => getMaintenanceStatus(e) === "overdue",
      ).length;
      setCounts({ lowStockParts, overdueEquipment, loading: false });
    });

    return () => { cancelled = true; };
  }, [enabled, tick]);

  // ---- Live-refresh triggers ----
  useEffect(() => {
    if (!enabled) return;

    // Cross-tab: another tab writes equipment/parts → refetch here. The
    // listening tab's fetch cache is separate from the writer's, so bust
    // it first or cachedFetchJson would hand back the pre-write copy.
    const offBus = subscribeBus((evt) => {
      if (evt.kind !== "data-changed") return;
      if (evt.source !== "equipment") return;
      bustCachedFetch(PARTS_URL);
      bustCachedFetch(PLAN_URL);
      setTick((t) => t + 1);
    });

    // Same-tab catch-all: the parts/equipment write sites don't all
    // publish bus events, so poll while visible. At the 60s mark the 30s
    // fetch TTL has expired, so the refetch returns fresh (server-cached)
    // data without an explicit bust. Pauses on hidden tabs.
    let timer: ReturnType<typeof setInterval> | null = null;
    if (typeof window !== "undefined") {
      timer = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        setTick((t) => t + 1);
      }, 60_000);
    }

    return () => {
      offBus();
      if (timer) clearInterval(timer);
    };
  }, [enabled]);

  return counts;
}
