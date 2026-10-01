import type { SheetRow } from "@/types";
import { isDoneStatus } from "@/lib/constants";

/**
 * The day a task "happened" for day-based views (kanban เสร็จวันนี้, the
 * ซ่อมบำรุง digest, the reports window and per-day chart).
 *
 * Until Code.gs v3.36 closing an overdue task moved its DATE to today, so
 * every view could key on `date`. That move is gone (it cut the task
 * loose from its parts/time logs); a finished task now carries `doneAt`
 * and counts on the day it was closed. Rows written before the column
 * existed have no doneAt and keep using their date.
 */
export function taskActivityDay(t: SheetRow): string {
  if (t.doneAt && isDoneStatus(t.status)) return t.doneAt.slice(0, 10);
  return t.date;
}
