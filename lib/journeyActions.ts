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
import {
  markerKey, journeyScopedTasks, TURNOVER_MARKER_SPECS, type JourneyAction,
} from "@/lib/roomJourney";
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

/** Marker-task spec per close-action (the "ปิดงาน" buttons). */
export function journeyDoneSpec(
  id: JourneyAction["id"],
): { type: string; note: string; label: string } | null {
  switch (id) {
    case "doneCleanBefore":
      return { type: MOVEOUT_CLEAN_TYPE, note: MOVEOUT_CLEAN_NOTE, label: "ทำสะอาดก่อนตรวจ" };
    case "doneInspect":
      return { type: MOVEOUT_INSPECT_TYPE, note: MOVEOUT_INSPECT_NOTE, label: "ตรวจห้อง+คืนประกัน" };
    case "doneRepair":
      return { type: TURNOVER_REPAIR_TYPE, note: TURNOVER_REPAIR_NOTE, label: "ซ่อมตามผลตรวจ" };
    case "doneCleanAfter":
      return { type: AFTER_REPAIR_CLEAN_TYPE, note: AFTER_REPAIR_CLEAN_NOTE, label: "ทำสะอาดหลังซ่อม" };
    case "doneQc":
      return { type: QC_CHECKLIST_TYPE, note: QC_CHECKLIST_NOTE, label: "Checklist QC" };
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
  // Same cycle scoping as deriveJourney — a stale open marker from a
  // previous turnover must not block the create the panel is offering.
  const tasks: SheetRow[] = journeyScopedTasks(room);
  return tasks.some(
    (t) =>
      t.type === spec.type &&
      (t.note || "").trim().startsWith(key) &&
      !isClosedStatus(t.status),
  );
}

async function postSheetUpdate(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/sheet/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
}

/**
 * Flip every OPEN task matching (type, note-prefix) in the room's current
 * cycle to `status`. Returns how many tasks were targeted (0 = nothing to
 * close — likely a stale panel).
 *
 * One POST per distinct (date,type): Apps Script's updateTaskStatus flips
 * ALL rows sharing the composite key, so twins on the same day close
 * together. `id` rides along opportunistically — today's schema strips
 * it, and once task IDs (v3.21) deploy it pins the exact row instead.
 */
async function closeMarkerTasks(
  room: RoomView,
  spec: { type: string; note: string },
  status: string,
): Promise<number> {
  const key = markerKey(spec.note);
  const open = journeyScopedTasks(room).filter(
    (t) =>
      t.type === spec.type &&
      (t.note || "").trim().startsWith(key) &&
      !isClosedStatus(t.status),
  );
  const posted = new Set<string>();
  for (const t of open) {
    const k = `${t.date}|${t.type}`;
    if (posted.has(k)) continue;
    posted.add(k);
    const id = (t as SheetRow & { id?: string }).id;
    await postSheetUpdate({
      action: "updateTaskStatus",
      ...(id ? { id } : {}),
      date: t.date, type: t.type,
      building: room.building, room: room.room,
      status,
    });
  }
  return open.length;
}

/**
 * End-of-cycle sweep, run before every release (normal AND shortcut):
 *   - open turnover markers → ยกเลิก (work skipped, not done — and an
 *     open ทำสะอาด on a ว่าง room would flip its card back to "qc")
 *   - open ย้ายออก notices → เสร็จ (the move-out has factually happened;
 *     leaving it open keeps the room pinned in "แจ้งย้ายออก")
 * Returns how many tasks were closed.
 */
async function sweepTurnoverTasks(room: RoomView): Promise<number> {
  let closed = 0;
  for (const spec of TURNOVER_MARKER_SPECS) {
    closed += await closeMarkerTasks(room, spec, "ยกเลิก");
  }
  const posted = new Set<string>();
  for (const t of journeyScopedTasks(room)) {
    if (t.type !== "ย้ายออก" || isClosedStatus(t.status)) continue;
    const k = `${t.date}|${t.type}`;
    if (posted.has(k)) continue;
    posted.add(k);
    const id = (t as SheetRow & { id?: string }).id;
    await postSheetUpdate({
      action: "updateTaskStatus",
      ...(id ? { id } : {}),
      date: t.date, type: t.type,
      building: room.building, room: room.room,
      status: "เสร็จ",
    });
    closed++;
  }
  return closed;
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
      // Sweep first — normally nothing is open at release-ready, but a
      // stale marker left behind would flip the freshly-ว่าง room back
      // to "qc" via the pending-clean status override.
      await sweepTurnoverTasks(room);
      await quickSetRoomStatus(room, "ว่าง", deps, { clearTenant: true });
      return "done";
    case "releaseNow": {
      // ทางลัด: moveout → ว่าง in one press, skipping the remaining
      // pipeline. Destructive-ish (cancels open prep work), so confirm.
      const ok =
        typeof window === "undefined" ||
        window.confirm(
          `ทางลัดปล่อยขาย — ห้อง ${room.building} ${room.room}\n\n` +
          "ระบบจะ:\n" +
          "• ยกเลิกงานเตรียมห้องที่ค้างอยู่ (ทำสะอาด/ตรวจ/ซ่อม/QC)\n" +
          "• ปิดงานย้ายออกของห้องนี้\n" +
          "• เปลี่ยนสถานะเป็น \"ว่าง\" และล้างข้อมูลผู้เช่าเดิม\n\n" +
          "ยืนยันหรือไม่?",
        );
      if (!ok) return "done";
      await sweepTurnoverTasks(room);
      await quickSetRoomStatus(room, "ว่าง", deps, { clearTenant: true });
      return "done";
    }
    default: {
      // ---- "ปิดงาน" buttons: mark this step's open task(s) done ----
      const doneSpec = journeyDoneSpec(id);
      if (doneSpec) {
        const n = await closeMarkerTasks(room, doneSpec, "เสร็จ");
        if (n === 0) {
          // Stale panel (task already closed elsewhere) — refresh fixes it.
          toast.info(`ไม่พบงาน${doneSpec.label}ที่ค้างอยู่ — รีเฟรชข้อมูลให้แล้ว`);
        } else {
          toast.success(`ปิดงาน${doneSpec.label}แล้ว ✓`);
          publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
        }
        deps.refresh();
        return "done";
      }
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
