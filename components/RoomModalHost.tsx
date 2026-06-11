"use client";

import { useEffect, useState } from "react";
import type { RoomView, SheetRow } from "@/types";
import RoomModal from "@/components/RoomModal";
import { toast } from "@/lib/toast";
import { publishBusEvent } from "@/lib/realtimeBus";
import { autoCreateMoveoutPrep } from "@/lib/dashboardActions";
import { roomBookmarkKey } from "@/lib/useRoomBookmarks";

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
  const [editStatus, setEditStatus] = useState("");
  const [editTenant, setEditTenant] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editContractEnd, setEditContractEnd] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editPrice, setEditPrice] = useState("");

  // Re-seed the edit fields whenever a (different) room opens.
  useEffect(() => {
    if (room) {
      setEditStatus(room.rawStatus || "");
      setEditTenant(room.tenant || "");
      setEditPhone(room.phone || "");
      setEditContractEnd(room.contractEnd || "");
      setEditPrice(room.price || "");
      setEditNote("");
    }
  }, [room]);

  async function handleSave() {
    if (!room) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateRoomStatus",
          building: room.building, room: room.room,
          status: editStatus, tenant: editTenant, phone: editPhone,
          contractEnd: editContractEnd, note: editNote, price: editPrice,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON response" }));
      console.log("[write] updateRoomStatus response", res.status, data);
      if (data.ok) {
        toast.success("บันทึกแล้ว — รีเฟรชข้อมูล");
        publishBusEvent({ kind: "data-changed", source: "room", ts: Date.now() });
        // Optimistic local update — shows the change immediately even if the
        // canonical CSV publish behind /api/sheet/rooms hasn't refreshed yet
        optimisticUpdateRoom(room.building, room.room, {
          status: editStatus,
          tenant: editTenant,
          phone: editPhone,
          contractEnd: editContractEnd,
          price: editPrice,
        });
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
