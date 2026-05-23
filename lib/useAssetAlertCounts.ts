"use client";

import { useEffect, useState } from "react";
import type { Part, RoomEquipment } from "@/types";
import { isLowStock } from "@/types";
import { getMaintenanceStatus } from "@/lib/maintenanceUtils";

/**
 * Aggregate counts for the engineer-side sidebar badges:
 *   - lowStockParts: parts with stock ≤ threshold (threshold > 0)
 *   - overdueEquipment: equipment past its service interval
 *
 * Single hook fetches both endpoints in parallel; consumer renders a
 * red badge next to "อะไหล่" and "บำรุงรักษา" sidebar items so the
 * engineer notices proactively.
 *
 * Silent-fail: if either endpoint errors, that count stays 0 (sidebar
 * just shows no badge — no crash, no warning toast).
 *
 * Skipped entirely when `enabled = false` (e.g. sales role can't see
 * /api/parts or /api/maintenance-plan; no point fetching).
 */

export interface AssetAlertCounts {
  lowStockParts: number;
  overdueEquipment: number;
  loading: boolean;
}

export function useAssetAlertCounts(enabled: boolean): AssetAlertCounts {
  const [counts, setCounts] = useState<AssetAlertCounts>({
    lowStockParts: 0,
    overdueEquipment: 0,
    loading: enabled,
  });

  useEffect(() => {
    if (!enabled) {
      setCounts({ lowStockParts: 0, overdueEquipment: 0, loading: false });
      return;
    }
    let cancelled = false;
    setCounts((c) => ({ ...c, loading: true }));

    Promise.all([
      fetch("/api/parts", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ rows: [] })),
      fetch("/api/maintenance-plan", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ rows: [] })),
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
  }, [enabled]);

  return counts;
}
