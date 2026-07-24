import type { SheetRow } from "@/types";
import { isClosedStatus } from "@/lib/constants";
import { getBangkokNow } from "@/lib/dateUtils";
import type { TurnoverStep } from "@/lib/realtimeBus";

/**
 * Move-out auto-prep — bridge between sales and engineer modes.
 *
 * When sales flips a room to "แจ้งย้ายออก" (moveout), the engineer side
 * should automatically see two prep jobs queued: an inspection and a
 * post-tenant clean. Previously the workflow buttons in RoomModal had
 * to be clicked by hand — easy to forget, and the engineer board never
 * surfaced the room at all until something was created.
 *
 * Constants exported so EngineerKanban and the auto-prep flow agree on
 * exactly which tasks count as "prep work for a move-out room."
 */

export const MOVEOUT_INSPECT_TYPE = "อื่นๆ";
export const MOVEOUT_INSPECT_NOTE =
  "ตรวจห้องก่อนคืนมัดจำ — เช็คเฟอร์ฯ / อุปกรณ์ / ความเรียบร้อย";

export const MOVEOUT_CLEAN_TYPE = "ทำสะอาด";
export const MOVEOUT_CLEAN_NOTE = "ทำสะอาดหลังย้ายออก — ปล่อยห้องใหม่ต่อ";

/* ====================================================================
 * Room-journey extension markers (turnover ขั้น 6-10).
 *
 * The journey panel distinguishes work items by NOTE PREFIX because the
 * sheet's task `type` column is too coarse (two different cleans both
 * use type "ทำสะอาด"). Each marker's first segment (before " —") is the
 * stable match key — lib/roomJourney matches with startsWith so a user
 * appending detail after the dash doesn't break stage detection.
 * ==================================================================== */

/** ทำสะอาดหลังซ่อม — distinct from MOVEOUT_CLEAN_NOTE (ก่อนตรวจ). */
export const AFTER_REPAIR_CLEAN_TYPE = "ทำสะอาด";
export const AFTER_REPAIR_CLEAN_NOTE = "ทำสะอาดหลังซ่อม — เตรียม QC ก่อนปล่อยขาย";

/** Checklist QC ก่อนปล่อยขาย (ฟอร์มกระดาษ 6 หมวด 28 ข้อ). */
export const QC_CHECKLIST_TYPE = "อื่นๆ";
export const QC_CHECKLIST_NOTE =
  "Checklist สภาพห้องก่อนปล่อยขาย — ตรวจตามฟอร์ม QC 6 หมวด";

/** งานซ่อมที่เกิดจากผลตรวจห้อง (เฟสซ่อมของ turnover). */
export const TURNOVER_REPAIR_TYPE = "ซ่อม";
export const TURNOVER_REPAIR_NOTE = "ซ่อมตามผลตรวจห้อง — ก่อนปล่อยขาย";

/**
 * Stable match key for a marker note — everything before the " —"
 * separator, so users can append detail without breaking detection.
 * Single source of truth (r11): roomJourney re-exports this; maintLog
 * and detectTurnoverStep below use it too (were 3 hand-rolled copies).
 */
export function markerKey(note: string): string {
  return note.split(" —")[0].trim();
}

export interface MoveoutPrepKind {
  /** Distinguishes the two prep tasks — used to label panel rows. */
  kind: "inspect" | "clean";
  type: string;
  note: string;
  label: string;
  icon: string;
}

export const MOVEOUT_PREP_KINDS: MoveoutPrepKind[] = [
  {
    kind: "inspect",
    type: MOVEOUT_INSPECT_TYPE,
    note: MOVEOUT_INSPECT_NOTE,
    label: "ตรวจห้อง",
    icon: "📋",
  },
  {
    kind: "clean",
    type: MOVEOUT_CLEAN_TYPE,
    note: MOVEOUT_CLEAN_NOTE,
    label: "ทำสะอาด",
    icon: "🧹",
  },
];

/**
 * Is there already a non-closed prep task of this type for the room?
 * Matched by (building, room, type) — note text isn't compared because
 * a user may have edited it after creation.
 */
export function hasOpenPrepTask(
  tasks: readonly SheetRow[] | undefined,
  building: string,
  room: string,
  type: string,
): boolean {
  if (!tasks || tasks.length === 0) return false;
  for (const t of tasks) {
    if (t.building !== building) continue;
    if (t.room !== room) continue;
    if (t.type !== type) continue;
    if (isClosedStatus(t.status)) continue;
    return true;
  }
  return false;
}

/**
 * Find the open prep task of a given kind (returns undefined when missing).
 */
export function findOpenPrepTask(
  tasks: readonly SheetRow[] | undefined,
  building: string,
  room: string,
  type: string,
): SheetRow | undefined {
  if (!tasks) return undefined;
  for (const t of tasks) {
    if (t.building !== building) continue;
    if (t.room !== room) continue;
    if (t.type !== type) continue;
    if (isClosedStatus(t.status)) continue;
    return t;
  }
  return undefined;
}

/**
 * Classify a task into a turnover-pipeline step by matching its note
 * prefix. Returns null when the task isn't part of the turnover flow
 * (regular ad-hoc cleans, ซ่อม without the turnover marker, sales tasks,
 * etc.) so the caller can skip the cross-unit notification.
 *
 * Note-prefix matched (not full equality) so users editing detail after
 * the dash don't break detection — same convention as roomJourney.
 */
export function detectTurnoverStep(task: SheetRow): TurnoverStep | null {
  const note = (task.note || "").trim();
  if (!note) return null;
  // Order matters when prefixes share a head (both cleans start with
  // "ทำสะอาด..."); the more-specific "หลังซ่อม" check comes first.
  if (note.startsWith(markerKey(AFTER_REPAIR_CLEAN_NOTE))) return "after-repair-clean";
  if (note.startsWith(markerKey(MOVEOUT_CLEAN_NOTE))) return "moveout-clean";
  if (note.startsWith(markerKey(MOVEOUT_INSPECT_NOTE))) return "inspect";
  if (note.startsWith(markerKey(TURNOVER_REPAIR_NOTE))) return "repair";
  if (note.startsWith(markerKey(QC_CHECKLIST_NOTE))) return "qc";
  return null;
}

/** Today as dd/MM/yyyy — matches sheet format used elsewhere. Bangkok
 *  wall-clock so an auto-created task stamped just after Bangkok midnight
 *  from a UTC host doesn't get yesterday's date (#157). */
export function todayThaiDate(): string {
  const d = getBangkokNow();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
