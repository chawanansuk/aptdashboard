"use client";

import { useEffect, useMemo, useState } from "react";
import type { Facility, RoomEquipment, RoomView, SheetRow } from "@/types";
import { parseThaiDate } from "@/lib/dateUtils";
import { getMaintenanceStatus } from "@/lib/maintenanceUtils";
import { isClosedStatus } from "@/lib/constants";
import { cachedFetchJson } from "@/lib/cachedFetchJson";
import { parsePriceOr0 } from "@/lib/money";

/* ====================================================================
 * Pure computation helpers — exported for testing.
 * ==================================================================== */

/** Re-export of lib/money.parsePriceOr0 to keep this hook's existing
 *  consumers (and their tests) importing `priceNum` unchanged. */
export const priceNum = parsePriceOr0;

function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// isClosedStatus moved to lib/constants for shared use

export interface OccupancyStats {
  total: number;
  occupied: number;   // มีผู้เช่า + แจ้งย้ายออก
  vacant: number;     // ว่าง
  rate: number;       // 0..1
  /**
   * 5-segment breakdown for the OverviewCards stacked bar. Sum equals
   * `total`. `maintenance` folds qc + repair + inactive — rooms that
   * aren't rentable today, regardless of why.
   */
  breakdown: {
    occupied: number;
    available: number;
    pending: number;
    moveout: number;
    maintenance: number;
  };
}

export function computeOccupancy(rooms: RoomView[]): OccupancyStats {
  let occupied = 0;
  let vacant = 0;
  const breakdown = { occupied: 0, available: 0, pending: 0, moveout: 0, maintenance: 0 };
  for (const r of rooms) {
    if (r.status === "occupied" || r.status === "moveout") occupied++;
    else if (r.status === "ready") vacant++;
    switch (r.status) {
      case "occupied": breakdown.occupied++; break;
      case "ready":    breakdown.available++; break;
      case "pending":  breakdown.pending++; break;
      case "moveout":  breakdown.moveout++; break;
      case "qc":
      case "repair":
      case "inactive": breakdown.maintenance++; break;
    }
  }
  const total = rooms.length;
  return { total, occupied, vacant, rate: total ? occupied / total : 0, breakdown };
}

export function computeTodayTaskCount(tasks: SheetRow[]): number {
  const today = todayDDMMYYYY();
  let n = 0;
  for (const t of tasks) {
    if (t.date !== today) continue;
    if (isClosedStatus(t.status)) continue;
    n++;
  }
  return n;
}

/**
 * Count contracts expiring within the same calendar month as today.
 * Uses Bangkok-aware parsing for the "dd/MM/yyyy" contractEnd format
 * the sheet stores.
 */
export function computeExpiringThisMonth(rooms: RoomView[]): number {
  const now = new Date();
  const yy = now.getFullYear();
  const mm = now.getMonth();
  let n = 0;
  for (const r of rooms) {
    if (!r.contractEnd) continue;
    const d = parseThaiDate(r.contractEnd);
    if (!d) continue;
    if (d.getFullYear() === yy && d.getMonth() === mm) n++;
  }
  return n;
}

/**
 * Monthly recurring income from occupied rooms (= IncomeView's
 * "รายได้ปัจจุบัน"). Sum of price for rooms with status
 * occupied | moveout.
 */
export function computeMonthlyIncome(rooms: RoomView[]): number {
  let total = 0;
  for (const r of rooms) {
    if (r.status === "occupied" || r.status === "moveout") {
      total += priceNum(r.price);
    }
  }
  return total;
}

export interface MaintenanceCounts {
  loading: boolean;
  error: string | null;
  overdue: number;
  dueSoon: number;
}

/**
 * Lazy-fetch equipment + facility for the maintenance card. Skipped
 * entirely if `enabled = false` (e.g. user is sales-only and can't
 * see the maintenance view).
 */
export function useMaintenanceCounts(enabled: boolean): MaintenanceCounts {
  const [state, setState] = useState<MaintenanceCounts>({
    loading: enabled,
    error: null,
    overdue: 0,
    dueSoon: 0,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, error: null, overdue: 0, dueSoon: 0 });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.all([
      cachedFetchJson<{ rows: RoomEquipment[] }>("/api/maintenance-plan")
        .then((j) => (j.rows || []) as RoomEquipment[])
        .catch(() => [] as RoomEquipment[]),
      cachedFetchJson<{ rows: Facility[] }>("/api/facilities")
        .then((j) => (j.rows || []) as Facility[])
        .catch(() => [] as Facility[]),
    ])
      .then(([equipment, facilities]) => {
        if (!alive) return;
        let overdue = 0;
        let dueSoon = 0;
        for (const e of equipment) {
          const s = getMaintenanceStatus(e);
          if (s === "overdue") overdue++;
          else if (s === "due-soon") dueSoon++;
        }
        for (const f of facilities) {
          const s = getMaintenanceStatus(f);
          if (s === "overdue") overdue++;
          else if (s === "due-soon") dueSoon++;
        }
        setState({ loading: false, error: null, overdue, dueSoon });
      })
      .catch((e) => {
        if (!alive) return;
        setState({
          loading: false,
          error: e instanceof Error ? e.message : "Network error",
          overdue: 0,
          dueSoon: 0,
        });
      });

    return () => { alive = false; };
  }, [enabled]);

  return state;
}

/* ====================================================================
 * Aggregate hook used by OverviewCards.
 * ==================================================================== */

export interface OverviewStats {
  occupancy: OccupancyStats;
  todayTaskCount: number;
  expiringThisMonth: number;
  monthlyIncome: number;
  maintenance: MaintenanceCounts;
}

export function useOverviewStats(
  rooms: RoomView[],
  tasks: SheetRow[],
  options: { canSeeMaintenance: boolean }
): OverviewStats {
  const occupancy = useMemo(() => computeOccupancy(rooms), [rooms]);
  const todayTaskCount = useMemo(() => computeTodayTaskCount(tasks), [tasks]);
  const expiringThisMonth = useMemo(() => computeExpiringThisMonth(rooms), [rooms]);
  const monthlyIncome = useMemo(() => computeMonthlyIncome(rooms), [rooms]);
  const maintenance = useMaintenanceCounts(options.canSeeMaintenance);
  return { occupancy, todayTaskCount, expiringThisMonth, monthlyIncome, maintenance };
}
