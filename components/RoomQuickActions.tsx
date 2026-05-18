"use client";

import { useEffect, useRef } from "react";
import type { Role } from "@/auth";
import type { RoomView } from "@/types";
import { canAccess, canPerform } from "@/lib/permissions";

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
}

interface ActionDef {
  key: string;
  label: string;
  icon: string;
  onClick: () => void;
}

export default function RoomQuickActions({
  room, anchor, roles, onClose,
  onOpenDetails, onRepair, onShowHistory, onShowTenant, onChangeStatus,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

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
      icon: "▦",
      onClick: () => { onOpenDetails(room); onClose(); },
    },
  ];
  if (canPerform(roles, "task.add.eng")) {
    actions.push({
      key: "repair",
      label: "แจ้งซ่อม",
      icon: "⚒",
      onClick: () => { onRepair(room); onClose(); },
    });
  }
  if (canPerform(roles, "room.editStatus")) {
    actions.push({
      key: "status",
      label: "เปลี่ยนสถานะ",
      icon: "◔",
      onClick: () => { onChangeStatus(room); onClose(); },
    });
  }
  actions.push({
    key: "history",
    label: `ดูประวัติงาน${room.pastTasks.length ? ` (${room.pastTasks.length})` : ""}`,
    icon: "🕘",
    onClick: () => { onShowHistory(room); onClose(); },
  });
  if (canAccess(roles, "tenants") && room.tenant) {
    actions.push({
      key: "tenant",
      label: `ผู้เช่า: ${room.tenant}`,
      icon: "👤",
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
        <span className="ac-quick-popover-title">{room.building} {room.room}</span>
        <button
          type="button"
          className="ac-quick-popover-close"
          onClick={onClose}
          aria-label="ปิด"
        >✕</button>
      </div>
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          className="ac-quick-popover-item"
          onClick={a.onClick}
          role="menuitem"
        >
          <span className="ac-quick-popover-icon" aria-hidden>{a.icon}</span>
          <span className="ac-quick-popover-label">{a.label}</span>
        </button>
      ))}
    </div>
  );
}
