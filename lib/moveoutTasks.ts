import type { SheetRow } from "@/types";
import { isClosedStatus } from "@/lib/constants";
import { getBangkokNow } from "@/lib/dateUtils";

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

/** Today as dd/MM/yyyy — matches sheet format used elsewhere. Bangkok
 *  wall-clock so an auto-created task stamped just after Bangkok midnight
 *  from a UTC host doesn't get yesterday's date (#157). */
export function todayThaiDate(): string {
  const d = getBangkokNow();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
