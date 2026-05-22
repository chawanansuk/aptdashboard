/**
 * SLA (Service Level Agreement) state per engineer task — Task 36.
 *
 * Why per-type SLA: ทำสะอาด typically same-day (1 day SLA) but ซ่อม
 * tasks can legitimately take 2-3 days (parts, scheduling). One global
 * "overdue if past date" was too coarse and made everything red after
 * day 1 — engineers stopped paying attention.
 *
 * The model: each task type has a `slaDays` budget starting from the
 * task's scheduled date. The state then maps to a 3-band color cue:
 *
 *   future        — task date is still ahead (no signal)
 *   ok            — within first half of SLA window
 *   warn          — past 50% of SLA (yellow, "approaching")
 *   overdue       — past SLA window (red, "fix now")
 *   idle          — task is done/cancelled, no signal needed
 *
 * The Kanban card uses `state` to add a CSS class and (when overdue)
 * a small badge "เกิน N วัน".
 *
 * Note: source data has day-level granularity only (sheet stores
 * dd/MM/yyyy). Hour-level SLA — common in IT ticketing — isn't
 * meaningful here without a creation timestamp column.
 */

import { parseThaiDate } from "@/lib/dateUtils";
import { isDoneStatus, isCancelledStatus } from "@/lib/constants";

export type SlaState = "future" | "ok" | "warn" | "overdue" | "idle";

/** Days budget per task type. Tuned to property-management reality. */
export const SLA_DAYS_BY_TYPE: Record<string, number> = {
  "ซ่อม":     3,  // repairs — parts/scheduling tolerance
  "ทำสะอาด": 1,  // cleaning — should happen same day
  // Sales-side appointments aren't "work tickets" — they have a fixed
  // appointment date, not a budget. Map to 0 so the helper returns
  // 'idle' for them (caller can choose not to render any badge).
  "ย้ายเข้า":  0,
  "ย้ายออก":  0,
  "ชมห้อง":  0,
  "อื่นๆ":   3,
};

export function getSlaDays(taskType: string): number {
  return SLA_DAYS_BY_TYPE[taskType] ?? 3;
}

interface ComputeOptions {
  /** Override "now" for tests. */
  now?: Date;
}

export interface SlaResult {
  state: SlaState;
  /** Whole days since the task date (negative = future). */
  daysSinceDate: number;
  /** Whole days past the SLA budget (>=0 means overdue). */
  daysOverSla: number;
  /** Configured SLA budget for this task type. */
  slaDays: number;
}

/**
 * Compute the SLA state for a task. Pure — testable. Status drives
 * whether to render at all: done/cancelled → 'idle'.
 */
export function computeSla(
  task: { date: string; type: string; status: string },
  opts: ComputeOptions = {},
): SlaResult {
  const slaDays = getSlaDays(task.type);

  if (isDoneStatus(task.status) || isCancelledStatus(task.status)) {
    return { state: "idle", daysSinceDate: 0, daysOverSla: 0, slaDays };
  }
  if (slaDays <= 0) {
    return { state: "idle", daysSinceDate: 0, daysOverSla: 0, slaDays };
  }

  const d = parseThaiDate(task.date);
  if (!d) {
    return { state: "idle", daysSinceDate: 0, daysOverSla: 0, slaDays };
  }

  const now = opts.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const taskDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysSinceDate = Math.floor((today.getTime() - taskDay.getTime()) / (1000 * 60 * 60 * 24));

  // Future task — not started yet
  if (daysSinceDate < 0) {
    return { state: "future", daysSinceDate, daysOverSla: 0, slaDays };
  }

  const daysOverSla = daysSinceDate - slaDays;

  // Already past the SLA window
  if (daysOverSla >= 0) {
    return { state: "overdue", daysSinceDate, daysOverSla, slaDays };
  }
  // Past 50% of the budget → warning
  if (daysSinceDate >= Math.ceil(slaDays / 2)) {
    return { state: "warn", daysSinceDate, daysOverSla, slaDays };
  }
  return { state: "ok", daysSinceDate, daysOverSla, slaDays };
}

/**
 * Short human label for the overdue badge, e.g. "เกิน SLA 3 วัน". Empty
 * for non-overdue states so the caller can render conditionally.
 */
export function slaBadgeLabel(result: SlaResult): string {
  if (result.state !== "overdue") return "";
  // daysOverSla can be 0 the moment the budget runs out — phrase as
  // "ครบกำหนดวันนี้" rather than "เกิน 0 วัน"
  if (result.daysOverSla <= 0) return "ครบกำหนดวันนี้";
  return `เกิน SLA ${result.daysOverSla} วัน`;
}
