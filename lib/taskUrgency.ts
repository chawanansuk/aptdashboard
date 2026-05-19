import type { SheetRow } from "@/types";
import { parseThaiDate } from "@/lib/dateUtils";

/**
 * Task urgency classification — pure functions, no React.
 *
 * Drives the visual hierarchy of TasksList (color-coded left borders,
 * urgency badges, bucket grouping). One source of truth so the same
 * "what does 'overdue' mean?" answer powers sorting, colors, and text.
 */

export type Urgency =
  | "overdue"    // date < today
  | "today"      // date === today
  | "tomorrow"   // date === today + 1
  | "thisWeek"   // date in next 2-7 days
  | "later"      // date > 7 days
  | "noDate";    // unparseable / empty date

/** Bucket headers + colors (used by TasksList grouping UI) */
export const URGENCY_META: Record<Urgency, { label: string; tone: string }> = {
  overdue:  { label: "เลยกำหนด",       tone: "danger" },
  today:    { label: "วันนี้",          tone: "info" },
  tomorrow: { label: "พรุ่งนี้",        tone: "info" },
  thisWeek: { label: "ในสัปดาห์นี้",    tone: "neutral" },
  later:    { label: "ต่อไป",          tone: "neutral" },
  noDate:   { label: "ไม่ระบุวันที่",   tone: "neutral" },
};

/** Render order for buckets — overdue surfaces first, noDate last. */
export const URGENCY_ORDER: Urgency[] = [
  "overdue", "today", "tomorrow", "thisWeek", "later", "noDate",
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Difference in calendar days (b - a). Negative = a is later. */
function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Returns urgency for a single task.
 * Tasks use dd/MM/yyyy date format (parseThaiDate handles it).
 * `now` is injectable for testability.
 */
export function getTaskUrgency(task: SheetRow, now: Date = new Date()): Urgency {
  if (!task.date) return "noDate";
  const taskDate = parseThaiDate(task.date);
  if (!taskDate) return "noDate";

  const diff = daysBetween(now, taskDate); // positive = future, negative = past
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 7) return "thisWeek";
  return "later";
}

/**
 * How many days overdue (always positive) — for the "เลย N วัน" badge.
 * Returns 0 for non-overdue tasks.
 */
export function daysOverdue(task: SheetRow, now: Date = new Date()): number {
  if (!task.date) return 0;
  const taskDate = parseThaiDate(task.date);
  if (!taskDate) return 0;
  const diff = daysBetween(now, taskDate);
  return diff < 0 ? -diff : 0;
}

/**
 * Sort comparator within a bucket. Overdue bucket sorts oldest-first
 * (most-overdue surfaces top); future buckets sort by building+room
 * for stable visual grouping.
 */
export function compareTasksInBucket(a: SheetRow, b: SheetRow, bucket: Urgency): number {
  if (bucket === "overdue") {
    const da = daysOverdue(b);
    const db = daysOverdue(a);
    if (da !== db) return da - db; // higher overdue first
  }
  // Stable: building, then numeric-aware room
  if (a.building !== b.building) return a.building.localeCompare(b.building);
  return a.room.localeCompare(b.room, undefined, { numeric: true });
}

/** Group tasks by urgency, dropping empty buckets and sorting internally. */
export function bucketTasks(
  tasks: SheetRow[],
  now: Date = new Date()
): Array<{ urgency: Urgency; tasks: SheetRow[] }> {
  const groups = new Map<Urgency, SheetRow[]>();
  for (const t of tasks) {
    const u = getTaskUrgency(t, now);
    if (!groups.has(u)) groups.set(u, []);
    groups.get(u)!.push(t);
  }
  const out: Array<{ urgency: Urgency; tasks: SheetRow[] }> = [];
  for (const u of URGENCY_ORDER) {
    const list = groups.get(u);
    if (!list || list.length === 0) continue;
    out.push({
      urgency: u,
      tasks: list.sort((x, y) => compareTasksInBucket(x, y, u)),
    });
  }
  return out;
}
