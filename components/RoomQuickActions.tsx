"use client";

import { useEffect, useRef, useState } from "react";
import type { Role } from "@/auth";
import type { RoomView } from "@/types";
import { canAccess, canPerform } from "@/lib/permissions";
import { RAW_STATUS_OPTIONS, STATUS_DOT } from "@/lib/constants";
import { normalizeRoomStatus } from "@/lib/roomStatus";
import { Icon, type IconName } from "@/lib/icons";

interface Props {
  room: RoomView;
  anchor: DOMRect | null;  // bounding rect of the cell that triggered this
  roles: Role[] | undefined;
  onClose: () => void;
  onOpenDetails: (r: RoomView) => void;
  onRepair: (r: RoomView) => void;
  onShowHistory: (r: RoomView) => void;
  onShowTenant: (r: RoomView) => void;
  onChangeStatus: (r: RoomView) => void;
  /**
   * One-tap status hop (v3.23): ⋯ → เปลี่ยนสถานะ → tap the new status,
   * done — no full modal, no scrolling to the dropdown, no save button.
   * The handler (page-level) routes "ว่าง" through the release flow
   * (confirm + cancel open prep + blank old tenant) and "แจ้งย้ายออก"
   * through notice-moveout (files the prep clean automatically).
   * Optional: without it the item falls back to opening the modal.
   */
  onQuickStatus?: (r: RoomView, rawStatus: string) => Promise<void>;
}

interface ActionDef {
  key: string;
  label: string;
  icon: IconName;
  onClick: () => void;
}

export default function RoomQuickActions({
  room, anchor, roles, onClose,
  onOpenDetails, onRepair, onShowHistory, onShowTenant, onChangeStatus,
  onQuickStatus,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Second stage: the inline status picker replaces the action list.
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function pickStatus(raw: string) {
    if (!onQuickStatus || busy) return;
    setBusy(raw);
    try {
      await onQuickStatus(room, raw);
      onClose();
    } finally {
      setBusy(null);
    }
  }

  // Close on outside click + escape
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Position popover near the anchor (clip to viewport)
  let style: React.CSSProperties = { position: "fixed", top: 0, left: 0 };
  if (anchor && typeof window !== "undefined") {
    const POPOVER_W = 220;
    const POPOVER_H_EST = 200; // upper bound for clip math
    const gap = 6;
    let top = anchor.bottom + gap;
    let left = anchor.left;
    if (top + POPOVER_H_EST > window.innerHeight) {
      // Flip above
      top = Math.max(8, anchor.top - POPOVER_H_EST - gap);
    }
    if (left + POPOVER_W > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - POPOVER_W - 8);
    }
    style = { position: "fixed", top, left, width: POPOVER_W };
  }

  // Build actions, gated by permission
  const actions: ActionDef[] = [
    {
      key: "details",
      label: "ดูรายละเอียดเต็ม",
      icon: "view",
      onClick: () => { onOpenDetails(room); onClose(); },
    },
  ];
  if (canPerform(roles, "task.add.eng")) {
    actions.push({
      key: "repair",
      label: "แจ้งซ่อม",
      icon: "maintenance",
      onClick: () => { onRepair(room); onClose(); },
    });
  }
  if (canPerform(roles, "room.editStatus")) {
    actions.push({
      key: "status",
      label: "เปลี่ยนสถานะ",
      icon: "edit",
      // Inline picker when the quick handler is wired; modal otherwise.
      onClick: () => {
        if (onQuickStatus) setPicking(true);
        else { onChangeStatus(room); onClose(); }
      },
    });
  }
  actions.push({
    key: "history",
    label: `ดูประวัติงาน${room.pastTasks.length ? ` (${room.pastTasks.length})` : ""}`,
    icon: "history",
    onClick: () => { onShowHistory(room); onClose(); },
  });
  if (canAccess(roles, "tenants") && room.tenant) {
    actions.push({
      key: "tenant",
      label: `ผู้เช่า: ${room.tenant}`,
      icon: "tenants",
      onClick: () => { onShowTenant(room); onClose(); },
    });
  }

  return (
    <div
      ref={ref}
      className="ac-quick-popover"
      style={style}
      role="menu"
      aria-label={`Quick actions ${room.building} ${room.room}`}
    >
      <div className="ac-quick-popover-head">
        <span className="ac-quick-popover-title">
          {picking ? `เปลี่ยนสถานะ · ${room.building} ${room.room}` : `${room.building} ${room.room}`}
        </span>
        <button
          type="button"
          className="ac-quick-popover-close"
          onClick={onClose}
          aria-label="ปิด"
        >✕</button>
      </div>

      {picking ? (
        <>
          {RAW_STATUS_OPTIONS.map((s) => {
            const isCurrent = normalizeRoomStatus(s) === room.status;
            return (
              <button
                key={s}
                type="button"
                className={`ac-quick-popover-item ${isCurrent ? "is-current" : ""}`}
                onClick={() => void pickStatus(s)}
                disabled={busy !== null || isCurrent}
                role="menuitem"
              >
                <span
                  className="ac-quick-popover-dot"
                  style={{ background: STATUS_DOT[normalizeRoomStatus(s)] }}
                  aria-hidden
                />
                <span className="ac-quick-popover-label">
                  {busy === s ? "กำลังบันทึก…" : s}
                  {isCurrent ? " · ปัจจุบัน" : ""}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="ac-quick-popover-item ac-quick-popover-back"
            onClick={() => setPicking(false)}
            disabled={busy !== null}
            role="menuitem"
          >
            <span className="ac-quick-popover-icon" aria-hidden><Icon name="view" size={15} /></span>
            <span className="ac-quick-popover-label">‹ กลับ / แก้แบบละเอียดในหน้าห้อง</span>
          </button>
        </>
      ) : (
        actions.map((a) => (
          <button
            key={a.key}
            type="button"
            className="ac-quick-popover-item"
            onClick={a.onClick}
            role="menuitem"
          >
            <span className="ac-quick-popover-icon" aria-hidden><Icon name={a.icon} size={15} /></span>
            <span className="ac-quick-popover-label">{a.label}</span>
          </button>
        ))
      )}
    </div>
  );
}
