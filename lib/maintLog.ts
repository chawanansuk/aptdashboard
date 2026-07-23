import type { SheetRow } from "@/types";
import { isCancelledStatus, isDoneStatus } from "@/lib/constants";
import { parseThaiDate } from "@/lib/dateUtils";

/**
 * บันทึกซ่อมบำรุง — pure helpers for the MaintLogView.
 *
 * Scope: maintenance-flavored work only (ซ่อม / ทำสะอาด / อื่นๆ).
 * Sales appointments (ชมห้อง / ย้ายเข้า / ย้ายออก) belong to the sales
 * views and would drown the maintenance story.
 *
 * Common-area convention: tasks logged with room = "ส่วนกลาง" (the log
 * modal writes this) are shown in their own section — เปลี่ยนหลอดไฟ
 * ส่วนกลาง / ทาสี / เติมน้ำยา etc.
 *
 * Data window: the dashboard feed carries every OPEN task + closed
 * tasks from the last 120 days (v3.22), so period pickers stay within
 * ~4 months. Older months live in the read-only report sheet.
 */

export const MAINT_TYPES = ["ซ่อม", "ทำสะอาด", "อื่นๆ"] as const;

/** The room value the log modal writes for common-area work. */
export const COMMON_AREA_ROOM = "ส่วนกลาง";

export interface Period {
  key: string;
  label: string;
  /** Inclusive start-of-day timestamp. */
  start: number;
  /** Exclusive end timestamp (start of the day AFTER the period). */
  end: number;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const DAY_MS = 24 * 60 * 60 * 1000;
const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/** Monday-start week containing `now`, offset by `weeksBack`. */
function weekPeriod(now: Date, weeksBack: number, label: string): Period {
  const today = startOfDay(now);
  // getDay(): Sun=0 … Sat=6 → days since Monday.
  const sinceMonday = (today.getDay() + 6) % 7;
  const monday = new Date(today.getTime() - (sinceMonday + weeksBack * 7) * DAY_MS);
  return {
    key: `w${weeksBack}`,
    label,
    start: monday.getTime(),
    end: monday.getTime() + 7 * DAY_MS,
  };
}

function monthPeriod(year: number, month: number, key: string, label: string): Period {
  return {
    key,
    label,
    start: new Date(year, month, 1).getTime(),
    end: new Date(year, month + 1, 1).getTime(),
  };
}

/**
 * The period choices the view offers: this/last week, this/last month,
 * plus up to 2 more months back — everything inside the 120-day feed
 * window, so no extra fetch is ever needed.
 */
export function buildPeriods(now: Date = new Date()): Period[] {
  const periods: Period[] = [
    weekPeriod(now, 0, "สัปดาห์นี้"),
    weekPeriod(now, 1, "สัปดาห์ก่อน"),
    monthPeriod(now.getFullYear(), now.getMonth(), "m0", "เดือนนี้"),
  ];
  for (let back = 1; back <= 3; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const label = back === 1
      ? "เดือนก่อน"
      : `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
    periods.push(monthPeriod(d.getFullYear(), d.getMonth(), `m${back}`, label));
  }
  return periods;
}

export interface MaintEntry {
  task: SheetRow;
  /** Parsed start-of-day time — everything downstream sorts on this. */
  time: number;
  done: boolean;
}

export interface RoomGroup {
  building: string;
  room: string;
  entries: MaintEntry[];
  cost: number;
}

export interface MaintDigest {
  /** Per-room work, sorted building → room. */
  rooms: RoomGroup[];
  /** Common-area work (room = ส่วนกลาง), grouped per building. */
  common: RoomGroup[];
  /** Completed-count per type (only types with count > 0). */
  countsByType: [string, number][];
  doneCount: number;
  openCount: number;
  totalCost: number;
}

/**
 * Digest the task feed for one period. Cancelled tasks are excluded
 * entirely; open (not-done) tasks in the period ARE shown — "ยังค้าง"
 * is part of the week's story — but never counted into cost.
 */
export function buildMaintDigest(tasks: SheetRow[], period: Period): MaintDigest {
  const groups = new Map<string, RoomGroup>();
  const counts = new Map<string, number>();
  let doneCount = 0;
  let openCount = 0;
  let totalCost = 0;

  for (const t of tasks) {
    if (!(MAINT_TYPES as readonly string[]).includes(t.type)) continue;
    if (isCancelledStatus(t.status)) continue;
    const d = parseThaiDate(t.date);
    if (!d) continue;
    const time = startOfDay(d).getTime();
    if (time < period.start || time >= period.end) continue;

    const done = isDoneStatus(t.status);
    if (done) {
      doneCount++;
      counts.set(t.type, (counts.get(t.type) || 0) + 1);
      if (typeof t.cost === "number" && t.cost > 0) totalCost += t.cost;
    } else {
      openCount++;
    }

    const k = `${t.building}|${t.room}`;
    if (!groups.has(k)) {
      groups.set(k, { building: t.building, room: t.room, entries: [], cost: 0 });
    }
    const g = groups.get(k)!;
    g.entries.push({ task: t, time, done });
    if (done && typeof t.cost === "number" && t.cost > 0) g.cost += t.cost;
  }

  const all = Array.from(groups.values());
  for (const g of all) g.entries.sort((a, b) => b.time - a.time);
  const byName = (a: RoomGroup, b: RoomGroup) =>
    a.building.localeCompare(b.building, "th") ||
    a.room.localeCompare(b.room, undefined, { numeric: true });

  return {
    rooms: all.filter((g) => g.room !== COMMON_AREA_ROOM).sort(byName),
    common: all.filter((g) => g.room === COMMON_AREA_ROOM).sort(byName),
    countsByType: Array.from(counts.entries()),
    doneCount,
    openCount,
    totalCost,
  };
}

/** dd/MM for list rows (year is implied by the period). */
export function shortDate(time: number): string {
  const d = new Date(time);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Markdown export of a digest — the file the owner asked for ("ดึงข้อมูล
 * ออกมาเป็นไฟล์ md"). `includeCost` mirrors the on-screen permission.
 */
export function digestToMarkdown(
  digest: MaintDigest,
  periodLabel: string,
  opts: { includeCost: boolean },
): string {
  const lines: string[] = [];
  lines.push(`# สรุปงานซ่อมบำรุง — ${periodLabel}`);
  lines.push("");
  const typeSummary = digest.countsByType.map(([t, n]) => `${t} ${n}`).join(" · ");
  lines.push(`- งานเสร็จ: **${digest.doneCount}**${typeSummary ? ` (${typeSummary})` : ""}`);
  if (digest.openCount > 0) lines.push(`- ยังค้าง: **${digest.openCount}**`);
  if (opts.includeCost && digest.totalCost > 0) {
    lines.push(`- ค่าใช้จ่ายรวม: **${digest.totalCost.toLocaleString("th-TH")} บาท**`);
  }
  lines.push("");

  const section = (title: string, groups: RoomGroup[]) => {
    if (groups.length === 0) return;
    lines.push(`## ${title}`);
    lines.push("");
    for (const g of groups) {
      const head = g.room === COMMON_AREA_ROOM ? `${g.building} · ส่วนกลาง` : `${g.building} ${g.room}`;
      const cost = opts.includeCost && g.cost > 0 ? ` — ${g.cost.toLocaleString("th-TH")} บาท` : "";
      lines.push(`### ${head}${cost}`);
      for (const e of g.entries) {
        const note = (e.task.note || "").trim().replace(/\s*\n\s*/g, " / ") || e.task.type;
        const state = e.done ? "" : " _(ยังค้าง)_";
        const c = opts.includeCost && e.done && typeof e.task.cost === "number" && e.task.cost > 0
          ? ` — ${e.task.cost.toLocaleString("th-TH")} บ.`
          : "";
        lines.push(`- ${shortDate(e.time)} · ${e.task.type}: ${note}${c}${state}`);
      }
      lines.push("");
    }
  };

  section("รายห้อง", digest.rooms);
  section("พื้นที่ส่วนกลาง", digest.common);

  if (digest.rooms.length === 0 && digest.common.length === 0) {
    lines.push("_ไม่มีงานซ่อมบำรุงในช่วงนี้_");
  }
  return lines.join("\n");
}
