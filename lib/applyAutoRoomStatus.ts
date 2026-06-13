import type { RoomView } from "@/types";
import type { Role } from "@/auth";
import { canPerform } from "@/lib/permissions";
import { suggestRoomStatusAfterTaskDone } from "@/lib/autoRoomStatus";
import { toast } from "@/lib/toast";

/**
 * Post-task-update side effect:
 *   - Compute the suggested room status transition (cleaning done →
 *     room ready, etc. — see `autoRoomStatus.ts`)
 *   - If user has `room.editStatus` permission, write it via
 *     `/api/sheet/update` and show a success toast
 *   - Otherwise (engineer / sales), show a passive info toast so the
 *     user knows the room *should* be updated but didn't grant write
 *
 * Called from EngineerKanban (moveTo), TasksList (status change), and
 * TaskDetailDrawer (action footer) — all 3 paths end with a task
 * status mutation that should trigger the room transition.
 *
 * Best-effort: errors are swallowed (silent) because this is a
 * non-critical post-action; the task status update already
 * succeeded by the time we get here.
 */

interface TaskShape {
  type: string;
  building: string;
  room: string;
  note?: string;
}

export async function applyAutoRoomStatus(opts: {
  task: TaskShape;
  newTaskStatus: string;
  rooms: RoomView[];
  roles: Role[] | undefined;
}): Promise<void> {
  const { task, newTaskStatus, rooms, roles } = opts;

  // Find the linked room (skip common-area tasks — their "room" is a
  // facility marker, not a real room).
  if (task.room.startsWith("ส่วนกลาง:")) return;
  const room = rooms.find((r) => r.building === task.building && r.room === task.room);
  if (!room) return;

  const suggestion = suggestRoomStatusAfterTaskDone(task.type, newTaskStatus, room.status, task.note);
  if (!suggestion) return;

  const canWrite = canPerform(roles, "room.editStatus");
  if (!canWrite) {
    // Passive hint — surface so non-management user can ask manager.
    toast.info(
      `ห้อง ${task.room} น่าจะอัปเดตเป็น "${suggestion.label}"`,
    );
    return;
  }

  // Write the room status change.
  try {
    const res = await fetch("/api/sheet/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateRoomStatus",
        building: task.building,
        room: task.room,
        status: suggestion.rawStatus,
        // Preserve other fields — server endpoint accepts partial
        // when these are omitted (Apps Script updates only what it gets).
      }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    if (data.ok) {
      toast.success(`อัปเดตห้อง ${task.room} → ${suggestion.label}`);
    }
  } catch {
    // Silent — non-critical side effect
  }
}
