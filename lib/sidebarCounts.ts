/**
 * Sidebar badge counts — pure computation extracted from app/page.tsx
 * (breakup PR 5) so it's unit-testable and the page keeps only a thin
 * useMemo wrapper.
 *
 * Counts are scoped by the active building filter:
 *   - per-status room counts (STATUS_KEYS) + today's task flag count
 *   - total rooms in scope
 *   - overdue: open tasks dated before today (sales/engineer/management
 *     all care; same building scope for consistency)
 */

import type { RoomStatus, RoomView, SheetRow } from "@/types";
import { STATUS_KEYS, isClosedStatus } from "@/lib/constants";
import { getBangkokNow, isTaskOverdue } from "@/lib/dateUtils";
import { detectTurnoverStep } from "@/lib/moveoutTasks";

export type SidebarCounts = {
  total: number;
  today: number;
  overdue: number;
  /**
   * Open turnover-tagged engineer tasks. Drives a badge on the
   * "กระดานงานช่าง" entry so an engineer who hasn't opened the kanban
   * yet still sees that sales pushed new turnover work their way.
   */
  engTurnover: number;
} & Partial<Record<RoomStatus, number>>;

export function computeSidebarCounts(
  rooms: RoomView[],
  tasks: SheetRow[],
  activeBuilding: string,
  // Bangkok-aware (audit r22) — เดิม midnight ของ device ผิดวันถ้าเครื่องไม่ใช่ TZ ไทย
  now: Date = getBangkokNow(),
): SidebarCounts {
  const scope = activeBuilding === "ทั้งหมด" ? rooms : rooms.filter((r) => r.building === activeBuilding);
  const c: Record<string, number> = { today: 0 };
  STATUS_KEYS.forEach((k) => (c[k] = 0));
  scope.forEach((r) => { c[r.status]++; if (r.today) c.today++; });

  const tasksScope = activeBuilding === "ทั้งหมด"
    ? tasks
    : tasks.filter((t) => t.building === activeBuilding);
  let overdue = 0;
  let engTurnover = 0;
  for (const t of tasksScope) {
    if (isClosedStatus(t.status)) continue;
    if (isTaskOverdue(t.date, now)) overdue++;
    if (detectTurnoverStep(t)) engTurnover++;
  }
  return { ...c, total: scope.length, overdue, engTurnover } as SidebarCounts;
}
