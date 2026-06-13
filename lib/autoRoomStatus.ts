import type { RoomStatus } from "@/types";
import { isDoneStatus } from "@/lib/constants";
import {
  MOVEOUT_CLEAN_NOTE, MOVEOUT_INSPECT_NOTE,
  AFTER_REPAIR_CLEAN_NOTE, QC_CHECKLIST_NOTE, TURNOVER_REPAIR_NOTE,
} from "@/lib/moveoutTasks";
import { markerKey } from "@/lib/roomJourney";

/**
 * Auto room-status suggestion when a task transitions to DONE.
 *
 * The dashboard distinguishes:
 *   - task.status (string from sheet — "เสร็จ" / "กำลังทำ" / ...)
 *   - room.status (RoomStatus enum — "ready" / "occupied" / ...)
 *   - room.rawStatus (raw string — "ว่าง" / "มีผู้เช่า" / ...)
 *
 * When a cleaning task is marked done, the room is usually ready for
 * the next tenant. When a move-out task is marked done, the room
 * transitions to QC (ready for inspection). These transitions are
 * predictable enough to suggest automatically — but the API call
 * to apply the change is server-permissioned (management only), so
 * non-management roles get a passive toast instead of an active write.
 *
 * The function returns the *suggested raw status* (sheet string) +
 * a human label for the toast. Returns null when no automation
 * applies (e.g. ซ่อม or ชมห้อง types, or room status already correct).
 */

export interface RoomStatusSuggestion {
  /** Raw status string to write to the rooms sheet. */
  rawStatus: string;
  /** Human-readable status name for toast/UI ("ว่าง" / "มีผู้เช่า" / ...). */
  label: string;
}

/** Note prefixes that mark a task as part of the turnover pipeline. Any
 *  task whose note starts with one of these is owned by lib/roomJourney
 *  — auto-status MUST NOT short-circuit it, or finishing a step in the
 *  middle of the pipeline (e.g. "ทำสะอาดก่อนตรวจ") would flip the room
 *  straight to ว่าง and skip the remaining 4 steps. */
const TURNOVER_MARKERS = [
  MOVEOUT_CLEAN_NOTE, MOVEOUT_INSPECT_NOTE,
  AFTER_REPAIR_CLEAN_NOTE, QC_CHECKLIST_NOTE, TURNOVER_REPAIR_NOTE,
].map(markerKey);

function isTurnoverTask(note: string | undefined): boolean {
  const n = (note || "").trim();
  return TURNOVER_MARKERS.some((k) => n.startsWith(k));
}

/**
 * Pure logic — returns null when no auto-update should happen.
 *
 * Rules (intentionally conservative — only the "obvious" transitions):
 *   - ทำสะอาด done   + current ∈ {qc, moveout}  → "ว่าง" (ready)
 *   - ย้ายเข้า done   + current ∈ {ready, pending}→ "มีผู้เช่า" (occupied)
 *   - ย้ายออก done   + current === "occupied"   → "ว่าง" (ready)
 *     (Some properties prefer QC after move-out, but "ready" matches the
 *      ROOM_STATUS dropdown that's the source of truth in the sheet.)
 *   - ซ่อม / ชมห้อง / อื่นๆ → no suggestion (too ambiguous)
 *
 * Turnover-pipeline override: tasks with a journey marker note
 * (lib/moveoutTasks) are owned by the journey state machine — auto
 * shortcut returns null so the user finishes the remaining steps via
 * the journey panel instead of getting the room flipped to ว่าง early.
 */
export function suggestRoomStatusAfterTaskDone(
  taskType: string,
  taskNewStatus: string,
  currentRoomStatus: RoomStatus | undefined,
  taskNote?: string,
): RoomStatusSuggestion | null {
  if (!isDoneStatus(taskNewStatus)) return null;
  if (!currentRoomStatus) return null;

  // Turnover marker → journey owns the next status hop.
  if (isTurnoverTask(taskNote)) return null;

  switch (taskType) {
    case "ทำสะอาด":
      if (currentRoomStatus === "qc" || currentRoomStatus === "moveout") {
        return { rawStatus: "ว่าง", label: "ว่าง" };
      }
      return null;
    case "ย้ายเข้า":
      if (currentRoomStatus === "ready" || currentRoomStatus === "pending") {
        return { rawStatus: "มีผู้เช่า", label: "มีผู้เช่า" };
      }
      return null;
    case "ย้ายออก":
      if (currentRoomStatus === "occupied" || currentRoomStatus === "moveout") {
        return { rawStatus: "ว่าง", label: "ว่าง" };
      }
      return null;
    default:
      return null;
  }
}
