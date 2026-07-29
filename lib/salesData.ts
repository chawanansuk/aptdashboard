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
import { parseThaiDate, getBangkokNow, THAI_MONTHS } from "@/lib/dateUtils";
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
  now: Date = getBangkokNow(),
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
 * เลยนัด — sales appointments dated BEFORE today whose task is still
 * open. buildAppointments deliberately shows future-only, which meant a
 * missed viewing/move-in silently vanished from the rail: nobody calls
 * the customer back. Capped at `maxDays` back so ancient unclosed rows
 * don't crowd the panel. Sorted most-overdue first.
 */
export interface OverdueAppointment extends Appointment {
  daysOverdue: number;
}

export function buildOverdueAppointments(
  tasks: SheetRow[],
  activeBuilding: string,
  now: Date = getBangkokNow(),
  maxDays: number = 14,
): OverdueAppointment[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoffMs = startOfToday.getTime() - maxDays * 86_400_000;
  const out: OverdueAppointment[] = [];
  for (const t of tasks || []) {
    if (activeBuilding !== "ทั้งหมด" && t.building !== activeBuilding) continue;
    if (!SALES_TASK_TYPES.has(t.type)) continue;
    if (isClosedStatus(t.status)) continue;
    const d = parseThaiDate(t.date);
    if (!d) continue;
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (day >= startOfToday.getTime() || day < cutoffMs) continue;
    out.push({
      task: t,
      date: d,
      daysOverdue: Math.round((startOfToday.getTime() - day) / 86_400_000),
    });
  }
  out.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return out;
}

/**
 * Count appointments within [from, from+days] inclusive of the last day.
 */
export function countAppointmentsWithinDays(
  items: { date: Date }[],
  days: number,
  from: Date = getBangkokNow(),
): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const cutoff = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days + 1);
  return items.filter(
    (a) => a.date.getTime() >= start.getTime() && a.date.getTime() < cutoff.getTime(),
  ).length;
}

/**
 * Real 7-point trend for the appointments KPI: weekly counts ending in
 * the current week (inclusive). Index 0 is the oldest week (~6 weeks
 * ago), index 6 is the current week.
 *
 * Unlike room-status counts (which need daily snapshots we don't keep),
 * appointments are events with dates already in the sheet, so we can
 * derive an honest backwards-looking trend without any backend work.
 * Both past and future task dates count — this measures "appointment
 * activity per week" regardless of completion, which is the metric a
 * sales user reads at a glance.
 */
export function buildAppointmentsTrend(
  tasks: SheetRow[],
  activeBuilding: string,
  weeks: number = 7,
  now: Date = getBangkokNow(),
): number[] {
  // Anchor: start of the current week (Sunday → Monday→…→Sunday boundary
  // is locale-y; we use Mon as the week start which matches the Thai
  // calendar convention used elsewhere in the app).
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 0 = Sunday → shift so Monday = 0.
  const dow = (today.getDay() + 6) % 7;
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

  const counts: number[] = new Array(weeks).fill(0);
  for (const t of tasks || []) {
    if (activeBuilding !== "ทั้งหมด" && t.building !== activeBuilding) continue;
    if (!SALES_TASK_TYPES.has(t.type)) continue;
    const d = parseThaiDate(t.date);
    if (!d) continue;
    // Snap the task date to ITS OWN week-start, then count whole weeks
    // back to ours. Naive (weekStart - d) / MS_WEEK floors mid-week
    // tasks into the wrong bucket — e.g. a Friday in the current week
    // returns -1 instead of 0. Using week-start-to-week-start with
    // round() also sidesteps DST ms drift.
    const dDow = (d.getDay() + 6) % 7;
    const dWeekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dDow);
    const diffWeeks = Math.round((weekStart.getTime() - dWeekStart.getTime()) / MS_WEEK);
    // diffWeeks = 0 → current week; positive → past; negative → future
    // Map to index: oldest (weeks-1 ago) = 0, current = weeks-1.
    const index = weeks - 1 - diffWeeks;
    if (index >= 0 && index < weeks) counts[index]++;
  }
  return counts;
}

export interface ApptDayGroup {
  /** yyyy-mm-dd-ish stable key for React. */
  key: string;
  /** Thai label: วันนี้ / พรุ่งนี้ / เสาร์ 7 มิ.ย. */
  label: string;
  /** Temporal bucket for styling — today/tomorrow get accent emphasis,
   *  everything further out is a calm "upcoming". Derived from the day
   *  diff so the UI never has to string-match the Thai label. */
  tone: "today" | "tomorrow" | "upcoming";
  items: Appointment[];
}

export interface ApptBuildingGroup {
  building: string;
  items: Appointment[];
}

/**
 * Split one day's appointments by building. Staff work a building at a
 * time (they walk one property), so a day with 3 นัด across 3 buildings
 * reads as three separate errands — the building name also moves out of
 * every card into one header, which is what makes the row fit on a phone.
 * Buildings follow BUILDING_ORDER (the team's mental order, same as the
 * card view); rooms sort numerically within a building.
 */
export function groupAppointmentsByBuilding(items: Appointment[]): ApptBuildingGroup[] {
  const index = new Map<string, Appointment[]>();
  for (const a of items) {
    const b = a.task.building || "(ไม่ระบุตึก)";
    if (!index.has(b)) index.set(b, []);
    index.get(b)!.push(a);
  }
  return Array.from(index.entries())
    .map(([building, list]) => ({
      building,
      items: [...list].sort((x, y) =>
        (x.task.room || "").localeCompare(y.task.room || "", undefined, { numeric: true })
      ),
    }))
    .sort(
      (a, b) =>
        buildingSortIndex(a.building) - buildingSortIndex(b.building) ||
        a.building.localeCompare(b.building, "th")
    );
}

const THAI_DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Whole-day diff between `d` and `now` (calendar days, sign preserved). */
function dayDiff(d: Date, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((that.getTime() - today.getTime()) / 86_400_000);
}

/** Human day label relative to `now`: วันนี้ / พรุ่งนี้ / เสาร์ 7 มิ.ย. */
export function dayLabel(d: Date, now: Date = getBangkokNow()): string {
  const diff = dayDiff(d, now);
  if (diff === 0) return "วันนี้";
  if (diff === 1) return "พรุ่งนี้";
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${THAI_DOW[that.getDay()]} ${that.getDate()} ${THAI_MONTHS[that.getMonth()]}`;
}

/** Temporal tone for a day group — drives accent emphasis in the rail. */
function dayTone(d: Date, now: Date): ApptDayGroup["tone"] {
  const diff = dayDiff(d, now);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return "upcoming";
}

/** Group already-sorted appointments by calendar day, preserving order. */
export function groupAppointmentsByDay(
  appts: Appointment[],
  now: Date = getBangkokNow(),
): ApptDayGroup[] {
  const out: ApptDayGroup[] = [];
  const index = new Map<string, ApptDayGroup>();
  for (const a of appts) {
    const k = dayKey(a.date);
    let g = index.get(k);
    if (!g) {
      g = { key: k, label: dayLabel(a.date, now), tone: dayTone(a.date, now), items: [] };
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
  now: Date = getBangkokNow(),
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
