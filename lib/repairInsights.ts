import type { SheetRow } from "@/types";
import { isCancelledStatus, isDoneStatus } from "@/lib/constants";
import { parseThaiDate } from "@/lib/dateUtils";
import { taskActivityDay } from "@/lib/taskDates";
import { isRepairCategory, suggestRepairCategory, type RepairCategory } from "@/lib/repairCategories";

/**
 * รอบ 2 งานซ่อม — what the repair log says once there is enough of it:
 *   - money and count per category / building ("ประปากินเงินเท่าไร")
 *   - rooms that keep needing work ("ห้องซ่อมบ่อย")
 *   - the same fault coming back in the same room ("เสียซ้ำ") — a sign
 *     the fix treated the symptom; flagged in the report, in the log, and
 *     in the form while the next repair is being written down.
 *
 * Everything is derived from the task feed the app already loads: no new
 * sheet columns, no new API. Rows from before v3.36 have no category —
 * they get the same guess the form makes from the note, marked `guessed`.
 */

export const REPEAT_WINDOW_DAYS = 90;
/** This many repairs of one category in one room within the window = a repeat. */
export const REPEAT_MIN = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RepairRecord {
  task: SheetRow;
  /** Start of the day the work belongs to (closed day for done jobs). */
  time: number;
  building: string;
  room: string;
  category: RepairCategory;
  /** No category in the sheet — read from the note. */
  guessed: boolean;
  done: boolean;
  /** Only finished jobs carry money; an open job's quote isn't spent yet. */
  cost: number;
}

/** Every repair (type ซ่อม, not cancelled) with a usable date. */
export function repairRecords(tasks: SheetRow[]): RepairRecord[] {
  const out: RepairRecord[] = [];
  for (const t of tasks) {
    if (t.type !== "ซ่อม" || isCancelledStatus(t.status)) continue;
    const d = parseThaiDate(taskActivityDay(t));
    if (!d) continue;
    const stored = isRepairCategory(t.category) ? t.category : null;
    const done = isDoneStatus(t.status);
    out.push({
      task: t,
      time: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
      building: t.building,
      room: t.room,
      category: stored ?? suggestRepairCategory(t.note || "") ?? "อื่นๆ",
      guessed: !stored,
      done,
      cost: done && typeof t.cost === "number" && t.cost > 0 ? t.cost : 0,
    });
  }
  return out;
}

export interface Tally { count: number; cost: number }

export interface RepairBreakdown {
  byCategory: (Tally & { category: RepairCategory })[];
  byBuilding: (Tally & { building: string })[];
  total: Tally;
}

/** Count + spend per category and per building, biggest spend first. */
export function repairBreakdown(records: RepairRecord[]): RepairBreakdown {
  const cats = new Map<RepairCategory, Tally>();
  const blds = new Map<string, Tally>();
  const total: Tally = { count: 0, cost: 0 };
  const add = <K,>(m: Map<K, Tally>, k: K, r: RepairRecord) => {
    const t = m.get(k) ?? { count: 0, cost: 0 };
    t.count++;
    t.cost += r.cost;
    m.set(k, t);
  };
  for (const r of records) {
    add(cats, r.category, r);
    add(blds, r.building, r);
    total.count++;
    total.cost += r.cost;
  }
  const order = (a: Tally, b: Tally) => b.cost - a.cost || b.count - a.count;
  return {
    byCategory: [...cats].map(([category, t]) => ({ category, ...t })).sort(order),
    byBuilding: [...blds].map(([building, t]) => ({ building, ...t })).sort(order),
    total,
  };
}

export interface RoomRepairs extends Tally {
  building: string;
  room: string;
  /** Category → count, most frequent first. */
  categories: [RepairCategory, number][];
  last: number;
}

/** Rooms with at least `min` repairs among `records`, most repairs first. */
export function frequentRooms(records: RepairRecord[], min = 2, limit = 10): RoomRepairs[] {
  const rooms = new Map<string, RoomRepairs & { cats: Map<RepairCategory, number> }>();
  for (const r of records) {
    const k = `${r.building}|${r.room}`;
    const g = rooms.get(k) ?? { building: r.building, room: r.room, count: 0, cost: 0, categories: [], last: 0, cats: new Map() };
    g.count++;
    g.cost += r.cost;
    g.last = Math.max(g.last, r.time);
    g.cats.set(r.category, (g.cats.get(r.category) ?? 0) + 1);
    rooms.set(k, g);
  }
  return [...rooms.values()]
    .filter((g) => g.count >= min)
    .map(({ cats, ...g }) => ({ ...g, categories: [...cats].sort((a, b) => b[1] - a[1]) }))
    .sort((a, b) => b.count - a.count || b.cost - a.cost || b.last - a.last)
    .slice(0, limit);
}

export interface RepeatFault {
  building: string;
  room: string;
  category: RepairCategory;
  /** Newest first. */
  records: RepairRecord[];
}

const windowStart = (now: number) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - REPEAT_WINDOW_DAYS * DAY_MS;
};

/**
 * Same room + same category, REPEAT_MIN or more times in the last
 * REPEAT_WINDOW_DAYS. "อื่นๆ" is skipped — two unrelated odd jobs aren't
 * the same fault.
 */
export function repeatFaults(records: RepairRecord[], now: number = Date.now()): RepeatFault[] {
  const from = windowStart(now);
  const groups = new Map<string, RepeatFault>();
  for (const r of records) {
    if (r.time < from || r.category === "อื่นๆ") continue;
    const k = `${r.building}|${r.room}|${r.category}`;
    const g = groups.get(k) ?? { building: r.building, room: r.room, category: r.category, records: [] };
    g.records.push(r);
    groups.set(k, g);
  }
  return [...groups.values()]
    .filter((g) => g.records.length >= REPEAT_MIN)
    .map((g) => ({ ...g, records: g.records.sort((a, b) => b.time - a.time) }))
    .sort((a, b) => b.records.length - a.records.length || b.records[0].time - a.records[0].time);
}

/** Earlier repairs of this category in this room within the window — the
 *  form shows them before the next one is saved. */
export function priorSameFault(
  tasks: SheetRow[],
  q: { building: string; room: string; category: string },
  now: number = Date.now(),
): RepairRecord[] {
  if (!q.building || !q.room || !isRepairCategory(q.category) || q.category === "อื่นๆ") return [];
  const from = windowStart(now);
  return repairRecords(tasks)
    .filter((r) => r.building === q.building && r.room === q.room && r.category === q.category && r.time >= from)
    .sort((a, b) => b.time - a.time);
}

/** "12/09" */
export function dayMonth(time: number): string {
  const d = new Date(time);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
