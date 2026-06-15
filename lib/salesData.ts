/**
 * Pure data shaping for the sales dashboard (ภาพรวมขาย v2).
 *
 * Extracted from the old SalesPipelineView's inline useMemos so the v2
 * components stay thin and the logic is unit-testable. No React, no
 * styling — just RoomView/SheetRow → view-model transforms.
 *
 * Business rules preserved verbatim from the original view:
 *   - appointments = future-dated, sales-type, not-closed tasks
 *   - building/floor ordering matches the sales team's mental model
 */

import type { RoomView, SheetRow, RoomStatus } from "@/types";
import { parseThaiDate, THAI_MONTHS } from "@/lib/dateUtils";
import { isClosedStatus } from "@/lib/constants";
import { toSalesStatus, type SalesStatus } from "@/lib/salesTheme";

/** Sales-relevant task types (viewing / move-in / move-out). */
export const SALES_TASK_TYPES = new Set(["ชมห้อง", "ย้ายเข้า", "ย้ายออก"]);

/** Preferred building order; unknowns sort to the end alphabetically. */
export const BUILDING_ORDER = ["Kl", "มั่งมี", "มายทรี48", "มีทรัพย์", "มีทอง"];

export function buildingSortIndex(name: string): number {
  const i = BUILDING_ORDER.indexOf(name);
  return i === -1 ? BUILDING_ORDER.length : i;
}

/** Numeric floors first ("1","2","10"), non-numeric to the end. */
export function floorSortKey(s: string): [number, string] {
  const n = parseInt(s, 10);
  if (Number.isFinite(n)) return [n, ""];
  return [Number.MAX_SAFE_INTEGER, s];
}

/** "dd/MM" — compact date for drawer mini-lists. */
export function formatDateShort(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export function scopeRooms(rooms: RoomView[], activeBuilding: string): RoomView[] {
  if (activeBuilding === "ทั้งหมด") return rooms;
  return rooms.filter((r) => r.building === activeBuilding);
}

/* ====================================================================
 * Appointments
 * ==================================================================== */

export interface Appointment {
  task: SheetRow;
  date: Date;
}

/** Future-dated (from start-of-today), sales-type, not-closed tasks,
 *  sorted soonest-first. Same predicate as the legacy view. */
export function buildAppointments(
  tasks: SheetRow[],
  activeBuilding: string,
  now: Date = new Date(),
): Appointment[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (tasks || [])
    .filter((t) => {
      if (activeBuilding !== "ทั้งหมด" && t.building !== activeBuilding) return false;
      if (!SALES_TASK_TYPES.has(t.type)) return false;
      if (isClosedStatus(t.status)) return false;
      const d = parseThaiDate(t.date);
      if (!d) return false;
      return d.getTime() >= startOfToday.getTime();
    })
    .map((t) => ({ task: t, date: parseThaiDate(t.date)! }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Count appointments within [from, from+days] inclusive of the last day.
 */
export function countAppointmentsWithinDays(
  items: { date: Date }[],
  days: number,
  from: Date = new Date(),
): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const cutoff = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days + 1);
  return items.filter(
    (a) => a.date.getTime() >= start.getTime() && a.date.getTime() < cutoff.getTime(),
  ).length;
}

export interface ApptDayGroup {
  /** yyyy-mm-dd-ish stable key for React. */
  key: string;
  /** Thai label: วันนี้ / พรุ่งนี้ / เสาร์ 7 มิ.ย. */
  label: string;
  items: Appointment[];
}

const THAI_DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Human day label relative to `now`: วันนี้ / พรุ่งนี้ / เสาร์ 7 มิ.ย. */
export function dayLabel(d: Date, now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((that.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "วันนี้";
  if (diff === 1) return "พรุ่งนี้";
  return `${THAI_DOW[that.getDay()]} ${that.getDate()} ${THAI_MONTHS[that.getMonth()]}`;
}

/** Group already-sorted appointments by calendar day, preserving order. */
export function groupAppointmentsByDay(
  appts: Appointment[],
  now: Date = new Date(),
): ApptDayGroup[] {
  const out: ApptDayGroup[] = [];
  const index = new Map<string, ApptDayGroup>();
  for (const a of appts) {
    const k = dayKey(a.date);
    let g = index.get(k);
    if (!g) {
      g = { key: k, label: dayLabel(a.date, now), items: [] };
      index.set(k, g);
      out.push(g);
    }
    g.items.push(a);
  }
  return out;
}

/* ====================================================================
 * Card view — group rooms by building → floor
 * ==================================================================== */

export interface FloorGroup { floor: string; rooms: RoomView[]; }
export interface BuildingGroup { building: string; total: number; floors: FloorGroup[]; }

/** Group + sort rooms (building order, floor ascending) for the card view.
 *  `floorDesc` flips floors to highest-first for the elevation grid. */
export function groupByBuildingFloor(
  rooms: RoomView[],
  floorDesc = false,
): BuildingGroup[] {
  const byBuilding = new Map<string, Map<string, RoomView[]>>();
  for (const r of rooms) {
    const b = r.building || "(ไม่ระบุตึก)";
    const f = r.floor || "—";
    if (!byBuilding.has(b)) byBuilding.set(b, new Map());
    const byFloor = byBuilding.get(b)!;
    if (!byFloor.has(f)) byFloor.set(f, []);
    byFloor.get(f)!.push(r);
  }

  const out: BuildingGroup[] = [];
  for (const [building, floorMap] of byBuilding) {
    const floors: FloorGroup[] = [];
    let total = 0;
    const entries = Array.from(floorMap.entries());
    entries.sort((a, b) => {
      const [na, sa] = floorSortKey(a[0]);
      const [nb, sb] = floorSortKey(b[0]);
      if (na !== nb) return floorDesc ? nb - na : na - nb;
      return floorDesc ? sb.localeCompare(sa) : sa.localeCompare(sb);
    });
    for (const [floor, rs] of entries) {
      const sorted = [...rs].sort((a, b) =>
        a.room.localeCompare(b.room, undefined, { numeric: true }));
      floors.push({ floor, rooms: sorted });
      total += rs.length;
    }
    out.push({ building, total, floors });
  }
  out.sort((a, b) => {
    const ia = buildingSortIndex(a.building);
    const ib = buildingSortIndex(b.building);
    if (ia !== ib) return ia - ib;
    return a.building.localeCompare(b.building);
  });
  return out;
}

/* ====================================================================
 * Grid board — per-building occupancy summary
 * ==================================================================== */

export interface BuildingGridModel {
  building: string;
  total: number;
  floorCount: number;
  occupiedPct: number;
  vacant: number;
  /** floors, highest-first, each with room cells in room-number order. */
  floors: FloorGroup[];
}

/** Build the elevation model for every building (all statuses included). */
export function buildBuildingGrids(rooms: RoomView[]): BuildingGridModel[] {
  const groups = groupByBuildingFloor(rooms, /* floorDesc */ true);
  return groups.map((g) => {
    const occupied = g.floors.reduce(
      (n, fg) => n + fg.rooms.filter((r) => toSalesStatus(r.status) === "occupied").length,
      0,
    );
    const vacant = g.floors.reduce(
      (n, fg) => n + fg.rooms.filter((r) => toSalesStatus(r.status) === "available").length,
      0,
    );
    return {
      building: g.building,
      total: g.total,
      floorCount: g.floors.length,
      occupiedPct: g.total > 0 ? Math.round((occupied / g.total) * 100) : 0,
      vacant,
      floors: g.floors,
    };
  });
}

/* ====================================================================
 * KPI counts
 * ==================================================================== */

export interface SalesKpis {
  available: number;
  appointmentsThisWeek: number;
  pending: number;
  moveout: number;
}

export function countByStatus(rooms: RoomView[], status: SalesStatus): number {
  return rooms.filter((r) => toSalesStatus(r.status) === status).length;
}

export function buildKpis(
  scopedRooms: RoomView[],
  appointments: Appointment[],
  now: Date = new Date(),
): SalesKpis {
  return {
    available: countByStatus(scopedRooms, "available"),
    appointmentsThisWeek: countAppointmentsWithinDays(appointments, 7, now),
    pending: countByStatus(scopedRooms, "pending"),
    moveout: countByStatus(scopedRooms, "moveout"),
  };
}

/** Filter rooms for the board: status set + floor + search + occupied toggle. */
export interface BoardFilter {
  statuses: Set<SalesStatus>;  // empty = all
  floor: string;               // "all" or a floor value
  search: string;
  showOccupied: boolean;
}

export function applyBoardFilter(rooms: RoomView[], f: BoardFilter): RoomView[] {
  const q = f.search.trim().toLowerCase();
  return rooms.filter((r) => {
    const ss = toSalesStatus(r.status);
    if (!f.showOccupied && ss === "occupied" && f.statuses.size === 0) return false;
    if (f.statuses.size > 0 && !f.statuses.has(ss)) return false;
    if (f.floor !== "all" && (r.floor || "—") !== f.floor) return false;
    if (q) {
      const hay = `${r.room} ${r.tenant || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Distinct floors present across the rooms, sorted ascending for the chip row. */
export function distinctFloors(rooms: RoomView[]): string[] {
  const set = new Set<string>();
  for (const r of rooms) set.add(r.floor || "—");
  return Array.from(set).sort((a, b) => {
    const [na, sa] = floorSortKey(a);
    const [nb, sb] = floorSortKey(b);
    if (na !== nb) return na - nb;
    return sa.localeCompare(sb);
  });
}
