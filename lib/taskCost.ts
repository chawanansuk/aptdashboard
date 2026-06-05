import type { SheetRow } from "@/types";

/**
 * Task cost helpers (v3.10.0).
 *
 * Tasks may carry a `cost` field (THB). Pure functions here keep the
 * sum + formatting logic out of components so they can be tested.
 *
 * Behavior:
 *   - sum ignores tasks with no cost / NaN / negative
 *   - "completed-only" variant sums only tasks whose status counts as done
 *   - formatBaht uses Thai locale grouping + ฿ suffix
 */

/** Status strings that count as "money was actually spent" (work completed). */
const COMPLETED_STATUSES = new Set(["เสร็จ", "done", "ปิดแล้ว"]);

function isCompleted(t: SheetRow): boolean {
  return COMPLETED_STATUSES.has((t.status || "").trim());
}

function numericCost(t: SheetRow): number {
  const n = typeof t.cost === "number" ? t.cost : Number(t.cost);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/** Total cost across a task list — includes all statuses. */
export function sumTaskCosts(tasks: SheetRow[]): number {
  let total = 0;
  for (const t of tasks) total += numericCost(t);
  return total;
}

/** Total cost across COMPLETED tasks only — for "actual spend" displays. */
export function sumCompletedCosts(tasks: SheetRow[]): number {
  let total = 0;
  for (const t of tasks) {
    if (isCompleted(t)) total += numericCost(t);
  }
  return total;
}

/** Format a baht value as "1,500 ฿". Returns empty string for 0.
 *  Re-export of lib/money's formatBaht so existing callers (sum +
 *  display) keep working unchanged. */
export { formatBaht } from "./money";

/** Parse user input (e.g. "1,500" or "1500") to a number. 0 for invalid.
 *  Backed by lib/money.parsePriceOr0 — same digits-only strategy as the
 *  rest of the app so a "1,500 ฿" string parses identically everywhere. */
export { parsePriceOr0 as parseCostInput } from "./money";
