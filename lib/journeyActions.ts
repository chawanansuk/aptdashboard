/**
 * Journey action executor — shared between RoomModalHost (full modal)
 * and the sales RoomDetailDrawer, so the "ขั้นตอนถัดไป" buttons behave
 * identically wherever they render.
 *
 * Two primitives cover every step:
 *   - quickSetRoomStatus: one-tap status hop that PRESERVES tenant
 *     fields (release →ว่าง explicitly clears them)
 *   - createJourneyTask: file a turnover task with the marker note the
 *     journey state machine (lib/roomJourney) keys on
 *
 * Flow-opening actions (booking / viewing) can't be executed headlessly
 * — they need the page's modal machinery — so `executeJourneyAction`
 * returns "delegate" for those and the caller decides what to do
 * (host: open its flows; sales drawer: hand off to the full modal).
 */

import type { RoomView, SheetRow } from "@/types";
import { toast } from "@/lib/toast";
import { publishBusEvent } from "@/lib/realtimeBus";
import { autoCreateMoveoutPrep } from "@/lib/dashboardActions";
import { isClosedStatus } from "@/lib/constants";
import { markerKey, type JourneyAction } from "@/lib/roomJourney";
import {
  MOVEOUT_CLEAN_TYPE, MOVEOUT_CLEAN_NOTE,
  MOVEOUT_INSPECT_TYPE, MOVEOUT_INSPECT_NOTE,
  AFTER_REPAIR_CLEAN_TYPE, AFTER_REPAIR_CLEAN_NOTE,
  QC_CHECKLIST_TYPE, QC_CHECKLIST_NOTE,
  TURNOVER_REPAIR_TYPE, TURNOVER_REPAIR_NOTE,
  todayThaiDate,
} from "@/lib/moveoutTasks";

/** Marker-task spec per create-action. Null for non-task actions. */
export function journeyTaskSpec(
  id: JourneyAction["id"],
): { type: string; note: string; label: string } | null {
  switch (id) {
    case "createCleanBefore":
      return { type: MOVEOUT_CLEAN_TYPE, note: MOVEOUT_CLEAN_NOTE, label: "ทำสะอาดก่อนตรวจ" };
    case "createInspect":
      return { type: MOVEOUT_INSPECT_TYPE, note: MOVEOUT_INSPECT_NOTE, label: "ตรวจห้อง+คืนประกัน" };
    case "createRepair":
      return { type: TURNOVER_REPAIR_TYPE, note: TURNOVER_REPAIR_NOTE, label: "ซ่อมตามผลตรวจ" };
    case "skipRepair": // no repair needed → next step is the QC checklist
    case "createQcChecklist":
      return { type: QC_CHECKLIST_TYPE, note: QC_CHECKLIST_NOTE, label: "Checklist QC" };
    case "createCleanAfter":
      return { type: AFTER_REPAIR_CLEAN_TYPE, note: AFTER_REPAIR_CLEAN_NOTE, label: "ทำสะอาดหลังซ่อม" };
    default:
      return null;
  }
}

export interface JourneyDeps {
  /** Refetch dashboard data after a successful write. */
  refresh: () => void;
  /** Optional optimistic room patch (full modal supplies it). */
  optimisticUpdateRoom?: (
    building: string,
    room: string,
    patch: { status?: string; tenant?: string; phone?: string; contractEnd?: string },
  ) => void;
  /** Live tasks list — dup guard for the moveout auto-prep bridge. */
  tasks?: SheetRow[];
}

export async function quickSetRoomStatus(
  room: RoomView,
  rawStatus: string,
  deps: JourneyDeps,
  opts: { clearTenant?: boolean } = {},
): Promise<void> {
  // Two server actions, both gated to room.editStatus:
  //   - updateRoomStatus: status(+note) ONLY. The route strips any tenant
  //     fields (security split #252) — the old code here sent them and
  //     believed they went through; they never did. A plain status hop
  //     leaves tenant data untouched server-side, which is what we want.
  //   - releaseRoom (ปล่อยขาย): Apps Script force-blanks the old tenant
  //     identity server-side from a fixed template. Without it, releasing
  //     a room LOOKED clean (optimistic patch) but the previous tenant's
  //     name/phone stayed in the sheet.
  const payload = opts.clearTenant
    ? { action: "releaseRoom", building: room.building, room: room.room, status: rawStatus }
    : { action: "updateRoomStatus", building: room.building, room: room.room, status: rawStatus };
  const post = (body: Record<string, unknown>) =>
    fetch("/api/sheet/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  let res = await post(payload);
  let data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
  if (!data.ok && opts.clearTenant && /unknown action/i.test(String(data.error || ""))) {
    // Backend not redeployed with releaseRoom yet — degrade to the plain
    // status write so ปล่อยขาย still flips the room (tenant blanking will
    // work after the next Apps Script redeploy).
    res = await post({ action: "updateRoomStatus", building: room.building, room: room.room, status: rawStatus });
    data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
  }
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  toast.success(`อัปเดตสถานะห้อง → ${rawStatus}`);
  publishBusEvent({ kind: "data-changed", source: "room", ts: Date.now() });
  deps.optimisticUpdateRoom?.(room.building, room.room, {
    status: rawStatus,
    ...(opts.clearTenant ? { tenant: "", phone: "", contractEnd: "" } : {}),
  });
  deps.refresh();
}

export async function createJourneyTask(
  room: RoomView,
  spec: { type: string; note: string; label: string },
): Promise<void> {
  const res = await fetch("/api/sheet/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "addTask",
      date: todayThaiDate(), type: spec.type,
      building: room.building, room: room.room,
      note: spec.note,
    }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  toast.success(`สร้างงาน${spec.label}แล้ว — ดูในกระดานงานช่าง`);
  publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
}

/**
 * Dup guard: is there already an OPEN task with this marker on the
 * room? Uses the same note-prefix matching as the journey state
 * machine. Protects against the stale-snapshot double-click: if the
 * UI's room object hasn't refreshed yet, the button may still render —
 * this stops the second POST from filing a duplicate.
 */
export function hasOpenJourneyTask(
  room: RoomView,
  spec: { type: string; note: string },
): boolean {
  const key = markerKey(spec.note);
  const tasks: SheetRow[] = [
    ...(room.todayTasks || []),
    ...(room.upcomingTasks || []),
    ...(room.pastTasks || []),
  ];
  return tasks.some(
    (t) =>
      t.type === spec.type &&
      (t.note || "").trim().startsWith(key) &&
      !isClosedStatus(t.status),
  );
}

export type JourneyExecResult = "done" | "delegate";

/**
 * Execute a journey action. Returns "delegate" for the two actions that
 * need the page's modal flows (booking / viewing) — the caller routes
 * those to its own UI. Throws on API failure (caller toasts).
 */
export async function executeJourneyAction(
  id: JourneyAction["id"],
  room: RoomView,
  deps: JourneyDeps,
): Promise<JourneyExecResult> {
  switch (id) {
    case "confirmBooking":
    case "addViewing":
      return "delegate";
    case "confirmMoveIn":
      await quickSetRoomStatus(room, "มีผู้เช่า", deps);
      return "done";
    case "noticeMoveout":
      await quickSetRoomStatus(room, "แจ้งย้ายออก", deps);
      // Same sales→engineer bridge as the save flow: file the prep clean.
      void autoCreateMoveoutPrep(deps.tasks ?? [], room.building, room.room, deps.refresh);
      return "done";
    case "releaseRoom":
      await quickSetRoomStatus(room, "ว่าง", deps, { clearTenant: true });
      return "done";
    default: {
      const spec = journeyTaskSpec(id);
      if (!spec) return "done"; // unknown — nothing to do
      if (hasOpenJourneyTask(room, spec)) {
        // Already filed (likely a double-click on a stale panel) —
        // surface gently instead of duplicating the kanban card.
        toast.info(`มีงาน${spec.label}ของห้องนี้ค้างอยู่แล้ว`);
        deps.refresh();
        return "done";
      }
      await createJourneyTask(room, spec);
      deps.refresh();
      return "done";
    }
  }
}
