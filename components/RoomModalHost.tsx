"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { RoomView, SheetRow } from "@/types";
import RoomModal from "@/components/RoomModal";
import RoomJourneyPanel from "@/components/RoomJourneyPanel";
import { toast } from "@/lib/toast";
import { publishBusEvent } from "@/lib/realtimeBus";
import { autoCreateMoveoutPrep } from "@/lib/dashboardActions";
import { canEditTenant, canAddEngTask } from "@/lib/permissions";
import { todayThaiDate } from "@/lib/moveoutTasks";
import { isTaskDatedToday } from "@/lib/dateUtils";
import { appendRepairLog } from "@/lib/repairLog";
import { isClosedStatus } from "@/lib/constants";
import { roomBookmarkKey } from "@/lib/useRoomBookmarks";
import type { JourneyAction } from "@/lib/roomJourney";
import { executeJourneyAction } from "@/lib/journeyActions";

/**
 * RoomModalHost — owns everything RoomModal needs that used to live
 * inline in app/page.tsx (PR 3 of the page.tsx breakup):
 *
 *   - the six edit-field states (status/tenant/phone/contractEnd/note/
 *     price) + the effect that re-seeds them when the room changes
 *   - handleSave: updateRoomStatus write → toast → optimistic patch →
 *     auto-create moveout prep when the room first flips to แจ้งย้ายออก
 *   - prev/next navigation list (current filtered view when possible,
 *     full sorted list as fallback)
 *
 * The page keeps `selectedRoom` itself — many views set it (calendar,
 * summary, sales board, kanban) — and passes it down. Everything else
 * about the modal is this component's business now.
 */

interface BookmarksApi {
  isPinned: (key: string) => boolean;
  togglePin: (key: string) => void;
}

interface Props {
  /** The selected room — null renders nothing. */
  room: RoomView | null;
  rooms: RoomView[];
  /** The user's current filtered view — preferred for prev/next. */
  visibleRooms: RoomView[];
  /** Live tasks — dup-guard for the auto moveout-prep bridge. */
  tasks: SheetRow[];
  defaultTab: "info" | "equipment";
  onClose: () => void;
  /** Navigate to another room (prev/next arrows). */
  onNavigate: (r: RoomView) => void;
  /** Optimistic local patch after a successful save. */
  optimisticUpdateRoom: (
    building: string,
    room: string,
    patch: { status?: string; tenant?: string; phone?: string; contractEnd?: string; price?: string },
  ) => void;
  /** Refetch after writes. */
  refresh: () => void;
  /** Workflow buttons — wired to the AddTask modal pre-fill at the page. */
  onAddTaskHere: (building: string, room: string) => void;
  onMoveoutInspect: (building: string, room: string) => void;
  onMoveoutClean: (building: string, room: string) => void;
  onMoveinClean: (building: string, room: string) => void;
  onMoveinSchedule: (building: string, room: string) => void;
  /** Booking flow hand-off (page swaps this modal for BookingConfirm). */
  onConfirmBooking: (r: RoomView) => void;
  bookmarks: BookmarksApi;
}

export default function RoomModalHost({
  room, rooms, visibleRooms, tasks, defaultTab,
  onClose, onNavigate, optimisticUpdateRoom, refresh,
  onAddTaskHere, onMoveoutInspect, onMoveoutClean, onMoveinClean, onMoveinSchedule,
  onConfirmBooking, bookmarks,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const { data: session } = useSession();
  const canEditTenantPii = canEditTenant(session?.user?.roles);
  const canLogRepair = canAddEngTask(session?.user?.roles);

  /**
   * Quick repair log — file an already-done ซ่อม task for THIS room
   * (any status, occupied included) so the work shows in the room's
   * ประวัติงาน without hunting for it on the engineer board.
   *
   * Normal path is one write (addTask with status "เสร็จ" — closed rows
   * don't block each other, so several repairs a day each get a row).
   * BUT addTask_'s dedup guard skips the append when an OPEN ซ่อม task
   * for this room exists dated today — and still returns ok:true with
   * `skipped: 'duplicate-open'`. Treating that as success silently lost
   * the entry. In that case we append the resolution onto the OPEN
   * task's note instead (same repairLog format the drawer uses), which
   * is also the semantically right home for it.
   */
  async function quickRepair(
    resolution: string,
    parts?: { partId: string; quantity: number }[],
  ) {
    if (!room) return;
    const note = resolution.trim();
    if (!note) return;
    setRepairing(true);
    try {
      const today = todayThaiDate();
      const res = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addTask",
          date: today,
          type: "ซ่อม",
          building: room.building,
          room: room.room,
          note,
          status: "เสร็จ",
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON response" }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);

      if (data.skipped === "duplicate-open") {
        // An open ซ่อม task for this room today blocked the append.
        // Attach the log to that task instead of dropping it.
        // Date match must be format-agnostic: we SENT dd/MM/yyyy but the
        // sheet echoes ISO yyyy-MM-dd when the cell got coerced to a real
        // Date — a raw `t.date === today` compare never matched those, so
        // the fallback threw instead of appending (audit round 3).
        const blocker = tasks.find((t) =>
          t.type === "ซ่อม" && t.building === room.building &&
          t.room === room.room && isTaskDatedToday(t.date) && !isClosedStatus(t.status),
        );
        if (!blocker) {
          // Local task list doesn't have the blocker (stale) — surface
          // the truth rather than a false success.
          throw new Error("ห้องนี้มีงานซ่อมค้างอยู่วันนี้ — เปิดงานนั้นในกระดานช่างแล้วบันทึกที่งานโดยตรง");
        }
        const upRes = await fetch("/api/sheet/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "updateTask",
            id: blocker.id || undefined, // v3.21
            match: { date: blocker.date, type: blocker.type, building: blocker.building, room: blocker.room },
            note: appendRepairLog(blocker.note || "", note),
          }),
        });
        const upData = await upRes.json().catch(() => ({ ok: false, error: "invalid JSON response" }));
        if (!upData.ok) throw new Error(upData.error || `HTTP ${upRes.status}`);
        toast.success("ต่อท้ายบันทึกในงานซ่อมที่เปิดอยู่ของห้องนี้แล้ว");
      } else {
        toast.success("บันทึกการซ่อมแล้ว");
      }

      // Parts used — file requisitions AGAINST THIS ROOM (the backend
      // has carried building/room since v3.16; this is the first UI
      // that connects a repair to stock). The repair itself is already
      // saved, so requisition failures degrade to a warning, never a
      // rollback. Serial — Apps Script writes are lock-serialized anyway.
      const lines = (parts || []).filter((p) => p.partId && p.quantity > 0);
      if (lines.length > 0) {
        let okCount = 0;
        let clampedCount = 0;
        for (const line of lines) {
          try {
            const rq = await fetch("/api/part-requisitions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "add",
                partId: line.partId,
                quantity: line.quantity,
                building: room.building,
                room: room.room,
                note: `งานซ่อม: ${note.slice(0, 80)}`,
              }),
            });
            const rqData = await rq.json().catch(() => ({ ok: false }));
            if (rqData.ok) {
              okCount++;
              // Apps Script clamps the withdrawal at remaining stock and
              // flags it — surface that instead of a silent "success"
              // that pretends the full quantity came out.
              if (rqData.clamped) clampedCount++;
            }
          } catch { /* counted below */ }
        }
        if (okCount === lines.length && clampedCount === 0) {
          toast.success(`เบิกอะไหล่แล้ว ${okCount} รายการ`);
        } else if (okCount === lines.length) {
          toast.info(`เบิกแล้ว ${okCount} รายการ — ${clampedCount} รายการสต็อกไม่พอ เบิกได้เท่าที่เหลือ (เช็คหน้าอะไหล่)`);
        } else {
          toast.error(`เบิกอะไหล่สำเร็จ ${okCount}/${lines.length} รายการ — เช็คหน้าอะไหล่`);
        }
      }

      publishBusEvent({ kind: "data-changed", source: "task", ts: Date.now() });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? `บันทึกการซ่อมไม่สำเร็จ: ${e.message}` : "Network error");
    } finally {
      setRepairing(false);
    }
  }

  const [editStatus, setEditStatus] = useState("");
  const [editTenant, setEditTenant] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editContractEnd, setEditContractEnd] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editPrice, setEditPrice] = useState("");

  // Re-seed the edit fields whenever a DIFFERENT room opens. Keyed on
  // identity (building|room), not the object reference — the parent now
  // passes a fresh RoomView object after every data refresh so the
  // journey panel can advance, and re-seeding on every refresh would
  // wipe the user's in-progress edits mid-typing.
  useEffect(() => {
    if (room) {
      setEditStatus(room.rawStatus || "");
      setEditTenant(room.tenant || "");
      setEditPhone(room.phone || "");
      setEditContractEnd(room.contractEnd || "");
      setEditPrice(room.price || "");
      setEditNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.building, room?.room]);

  async function handleSave() {
    if (!room) return;
    setSaving(true);
    try {
      // Pick the action that matches what the user is actually allowed to
      // write. Management gets updateRoomData (free-form, incl. tenant +
      // contract + price). Sales gets updateRoomStatus (status + note only;
      // the route strips PII fields server-side as a defense-in-depth even
      // if we forgot here). Same writer in Apps Script; the action choice
      // just gates which permission the route enforces.
      const body: Record<string, unknown> = canEditTenantPii
        ? {
            action: "updateRoomData",
            building: room.building, room: room.room,
            status: editStatus, tenant: editTenant, phone: editPhone,
            contractEnd: editContractEnd, note: editNote, price: editPrice,
          }
        : {
            action: "updateRoomStatus",
            building: room.building, room: room.room,
            status: editStatus, note: editNote,
          };
      const res = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON response" }));
      console.log("[write]", body.action, "response", res.status, data);
      if (data.ok) {
        toast.success("บันทึกแล้ว — รีเฟรชข้อมูล");
        publishBusEvent({ kind: "data-changed", source: "room", ts: Date.now() });
        // Optimistic local update — shows the change immediately even if the
        // canonical CSV publish behind /api/sheet/rooms hasn't refreshed yet.
        // For sales we only patch what the server actually wrote (status+note)
        // so empty PII state fields don't blank the local row.
        optimisticUpdateRoom(room.building, room.room, canEditTenantPii
          ? {
              status: editStatus,
              tenant: editTenant,
              phone: editPhone,
              contractEnd: editContractEnd,
              price: editPrice,
            }
          : { status: editStatus });
        // Bridge sales → engineer: when a room flips into "แจ้งย้ายออก"
        // for the first time, auto-create the prep tasks engineers need
        // (inspection + post-tenant clean). Skip when one already exists.
        const wasMoveout = room.status === "moveout";
        const isMoveout = editStatus === "moveout";
        if (!wasMoveout && isMoveout) {
          void autoCreateMoveoutPrep(tasks, room.building, room.room, refresh);
        }
        onClose();
        refresh();
      } else {
        const statusSuffix = res.status !== 200 ? ` (HTTP ${res.status})` : "";
        toast.error(`บันทึกไม่สำเร็จ${statusSuffix}: ${data.error || "unknown error"}`);
      }
    } catch (e) {
      console.error("[write] updateRoomStatus failed", e);
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally { setSaving(false); }
  }

  /**
   * Room-journey actions (ขั้นตอนถัดไป panel). Execution lives in
   * lib/journeyActions (shared with the sales drawer); the host only
   * routes "delegate" actions to its modal flows.
   */
  async function handleJourneyAction(id: JourneyAction["id"]): Promise<void> {
    if (!room) return;
    try {
      const result = await executeJourneyAction(id, room, {
        refresh,
        optimisticUpdateRoom,
        tasks,
      });
      if (result === "delegate") {
        if (id === "confirmBooking") onConfirmBooking(room);
        else if (id === "addViewing") onAddTaskHere(room.building, room.room);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    }
  }

  if (!room) return null;

  // RoomModal prev/next nav (#9). Prefer the user's current filtered
  // view (so "next" follows what they actually see). If the selected
  // room isn't in that list (e.g. opened from calendar task → outside
  // visibleRooms), fall back to the full sorted rooms list so
  // navigation still works.
  const navList = (() => {
    const inVisible = visibleRooms.findIndex(
      (r) => r.building === room.building && r.room === room.room,
    );
    if (inVisible >= 0) return visibleRooms;
    return [...rooms].sort((a, b) => {
      if (a.building !== b.building) return a.building.localeCompare(b.building);
      const fa = parseInt(a.floor || "0", 10) || 0;
      const fb = parseInt(b.floor || "0", 10) || 0;
      if (fa !== fb) return fa - fb;
      return a.room.localeCompare(b.room, undefined, { numeric: true });
    });
  })();
  const idx = navList.findIndex(
    (r) => r.building === room.building && r.room === room.room,
  );
  const prev = idx > 0 ? navList[idx - 1] : null;
  const next = idx >= 0 && idx < navList.length - 1 ? navList[idx + 1] : null;
  const bookmarkKey = roomBookmarkKey(room.building, room.room);

  return (
    <RoomModal
      room={room}
      saving={saving}
      defaultTab={defaultTab}
      journeySlot={<RoomJourneyPanel room={room} onAction={handleJourneyAction} />}
      status={editStatus} tenant={editTenant} phone={editPhone}
      contractEnd={editContractEnd} note={editNote} price={editPrice}
      onChange={(p) => {
        if (p.status !== undefined) setEditStatus(p.status);
        if (p.tenant !== undefined) setEditTenant(p.tenant);
        if (p.phone !== undefined) setEditPhone(p.phone);
        if (p.contractEnd !== undefined) setEditContractEnd(p.contractEnd);
        if (p.note !== undefined) setEditNote(p.note);
        if (p.price !== undefined) setEditPrice(p.price);
      }}
      onClose={onClose}
      onSave={handleSave}
      onQuickRepair={canLogRepair ? quickRepair : undefined}
      repairing={repairing}
      onAddTaskHere={() => onAddTaskHere(room.building, room.room)}
      onMoveoutInspect={() => onMoveoutInspect(room.building, room.room)}
      onMoveoutClean={() => onMoveoutClean(room.building, room.room)}
      onMoveinClean={() => onMoveinClean(room.building, room.room)}
      onMoveinSchedule={() => onMoveinSchedule(room.building, room.room)}
      onConfirmBooking={() => onConfirmBooking(room)}
      onPrevRoom={prev ? () => onNavigate(prev) : undefined}
      onNextRoom={next ? () => onNavigate(next) : undefined}
      roomIndex={idx >= 0 ? idx + 1 : undefined}
      roomTotal={navList.length}
      isPinned={bookmarks.isPinned(bookmarkKey)}
      onTogglePin={() => bookmarks.togglePin(bookmarkKey)}
    />
  );
}
