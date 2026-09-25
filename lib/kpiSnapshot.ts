import { z } from "zod";
import type { RoomView } from "@/types";
import { buildKpis, scopeRooms } from "@/lib/salesData";

/**
 * Daily room-status counts behind the sales KPI sparklines.
 *
 * The three room cards (ห้องว่างพร้อมขาย / รอย้ายเข้า / แจ้งย้ายออก) used to
 * draw an invented wave (removed in #347). A real trend needs yesterday's
 * number, which nothing stored. Now the sales page reports today's counts
 * to /api/kpi-snapshot (Redis, one key per Bangkok day) and reads the
 * previous days back. The counts are computed in the browser from the
 * SAME room views the cards show, so a day's point is exactly the number
 * the card said that day (last report of the day wins).
 */

export type SnapshotCounts = { available: number; pending: number; moveout: number };
/** One day: "ทั้งหมด" plus each building, so a building tab gets its own line. */
export type DaySnapshot = Record<string, SnapshotCounts>;
export type SnapshotKey = keyof SnapshotCounts;

export const ALL_BUILDINGS = "ทั้งหมด";
export const SNAPSHOT_DAYS = 7; // points on a sparkline, today included
export const SNAPSHOT_TTL_SEC = 40 * 24 * 60 * 60;

export function snapshotRedisKey(ymd: string): string {
  return `apt:v1:kpi:${ymd}`;
}

const Count = z.number().int().min(0).max(100_000);
export const DaySnapshotSchema = z
  .record(z.string().min(1).max(60), z.object({ available: Count, pending: Count, moveout: Count }).strict())
  .refine((o) => Object.keys(o).length >= 1 && Object.keys(o).length <= 60, { message: "1–60 scopes" })
  .refine((o) => ALL_BUILDINGS in o, { message: `missing "${ALL_BUILDINGS}"` });

/** Today's counts for every scope the building tabs can select. */
export function buildDaySnapshot(rooms: RoomView[]): DaySnapshot {
  const out: DaySnapshot = {};
  const scopes = [ALL_BUILDINGS, ...Array.from(new Set(rooms.map((r) => r.building))).filter(Boolean)];
  for (const b of scopes) {
    const k = buildKpis(scopeRooms(rooms, b), []);
    out[b] = { available: k.available, pending: k.pending, moveout: k.moveout };
  }
  return out;
}

/** The last `days` Bangkok dates as yyyy-MM-dd, oldest first, ending today. */
export function lastBangkokDates(days: number, now: Date = new Date()): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" });
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(fmt.format(new Date(now.getTime() - i * 86_400_000)));
  return out;
}

/**
 * Sparkline series for one scope: stored past days (oldest → newest; a day
 * nobody opened the page is simply skipped) followed by the live value.
 * Fewer than 2 points → no series, so a card never draws a line it has no
 * data for.
 */
export function trendsFor(
  history: { date: string; snapshot: DaySnapshot | null }[],
  scope: string,
  live: SnapshotCounts,
): Partial<Record<SnapshotKey, number[]>> {
  const past = history.map((h) => h.snapshot?.[scope]).filter((c): c is SnapshotCounts => !!c);
  if (past.length === 0) return {};
  const series = (k: SnapshotKey) => [...past.map((c) => c[k]), live[k]];
  return { available: series("available"), pending: series("pending"), moveout: series("moveout") };
}
