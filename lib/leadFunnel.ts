import { LEAD_STAGES, type Lead } from "@/types";
import { parseSheetTimestamp } from "@/lib/relativeTime";

/**
 * Lead pipeline analytics — pure functions, no React (Problem #10).
 *
 * Two things the Kanban couldn't show before:
 *   - how a lead is progressing (days sitting in its current stage,
 *     and whether that's gone stale), and
 *   - the shape of the funnel (counts per stage + conversion between
 *     consecutive active stages).
 */

/** Stages that mean the deal is finished — not "stuck", just done. */
export const TERMINAL_STAGES: readonly string[] = ["ปิดดีล", "ปิดเลิก"];

/** A lead is "stale" if it's sat in a non-terminal stage longer than
 *  this many days without an update. */
export const STALE_DAYS = 7;

/**
 * Whole days since the lead last moved (updatedAt, falling back to
 * createdAt). Returns null when no parseable timestamp exists.
 */
export function daysInStage(lead: Pick<Lead, "updatedAt" | "createdAt">, now: Date = new Date()): number | null {
  const d = parseSheetTimestamp(lead.updatedAt || lead.createdAt);
  if (!d) return null;
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 86_400_000);
}

/** True when a lead has gone stale: non-terminal stage + idle > STALE_DAYS. */
export function isStale(lead: Pick<Lead, "stage" | "updatedAt" | "createdAt">, now: Date = new Date()): boolean {
  if (TERMINAL_STAGES.includes(lead.stage)) return false;
  const days = daysInStage(lead, now);
  return days != null && days > STALE_DAYS;
}

export interface FunnelStage {
  stage: string;
  count: number;
  /** Conversion % from the previous stage's count (null for the first
   *  stage and when the previous stage is empty). */
  conversionFromPrev: number | null;
}

/**
 * Funnel counts per stage in LEAD_STAGES order, with conversion between
 * consecutive stages. Conversion uses raw stage occupancy (how many
 * leads currently sit at each stage) — a snapshot, not a cohort, which
 * matches how the board itself is read.
 */
export function computeFunnel(leads: Lead[]): FunnelStage[] {
  const counts = new Map<string, number>();
  for (const s of LEAD_STAGES) counts.set(s, 0);
  for (const l of leads) {
    if (counts.has(l.stage)) counts.set(l.stage, (counts.get(l.stage) || 0) + 1);
  }
  const out: FunnelStage[] = [];
  let prev: number | null = null;
  for (const s of LEAD_STAGES) {
    const count = counts.get(s) || 0;
    const conversionFromPrev =
      prev != null && prev > 0 ? Math.round((count / prev) * 100) : null;
    out.push({ stage: s, count, conversionFromPrev });
    prev = count;
  }
  return out;
}
