"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Role } from "@/auth";
import type { RoomView } from "@/types";
import type { Route } from "@/lib/permissions";
import {
  buildActions, searchRooms, searchViews, searchCommands,
  type CommandDef, type PaletteAction,
} from "@/lib/commandPaletteSearch";

interface Props {
  open: boolean;
  onClose: () => void;
  rooms: RoomView[];
  roles: Role[] | undefined;
  commands: CommandDef[];
  onSelectRoom: (r: RoomView) => void;
  onChangeView: (v: Route) => void;
}

const GROUP_LABEL: Record<number, string> = {
  0: "ห้อง",
  1: "หน้า",
  2: "คำสั่ง",
};

export default function CommandPalette({
  open, onClose, rooms, roles, commands, onSelectRoom, onChangeView,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Reset when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      // focus input after the paint
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const actions = useMemo<PaletteAction[]>(() => {
    if (!open) return [];
    return buildActions({ rooms, roles, commands, query, onSelectRoom, onChangeView });
  }, [open, rooms, roles, commands, query, onSelectRoom, onChangeView]);

  // Reset selection when result list changes shape
  useEffect(() => {
    if (selectedIdx >= actions.length) setSelectedIdx(0);
  }, [actions.length, selectedIdx]);

  // Map back from action → runner. Cleaner than threading callbacks
  // through buildActions (which stays pure for testability).
  function runAction(a: PaletteAction) {
    if (a.type === "room") {
      const [, building, room] = a.id.split(":");
      const r = rooms.find((x) => x.building === building && x.room === room);
      if (r) onSelectRoom(r);
    } else if (a.type === "view") {
      const route = a.id.split(":")[1] as Route;
      onChangeView(route);
    } else if (a.type === "command") {
      const cmdId = a.id.split(":").slice(1).join(":");
      const cmd = commands.find((c) => c.id === cmdId);
      cmd?.run();
    }
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => (actions.length ? (i + 1) % actions.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => (actions.length ? (i - 1 + actions.length) % actions.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const a = actions[selectedIdx];
      if (a) runAction(a);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  // Scroll selected item into view as the user navigates
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx, open]);

  // Count per group for header rendering
  const counts = useMemo(() => {
    if (!open) return { rooms: 0, views: 0, commands: 0 };
    return {
      rooms: searchRooms(rooms, query).length,
      views: searchViews(roles, query).length,
      commands: searchCommands(roles, commands, query).length,
    };
  }, [open, rooms, roles, commands, query]);

  if (!open) return null;

  // Insert visual group separators in the rendered list
  let lastGroup = -1;

  return (
    <div className="ac-cmdk-backdrop" onClick={onClose}>
      <div
        className="ac-cmdk"
        role="dialog"
        aria-label="ค้นหา"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="ac-cmdk-search">
          <span className="ac-cmdk-icon" aria-hidden>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="ค้นหาห้อง / หน้า / คำสั่ง..."
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
            aria-autocomplete="list"
          />
          <kbd className="ac-cmdk-esc">esc</kbd>
        </div>

        {actions.length === 0 ? (
          <div className="ac-cmdk-empty">
            {query ? `ไม่พบ "${query}"` : "พิมพ์เพื่อค้น..."}
          </div>
        ) : (
          <ul ref={listRef} className="ac-cmdk-list" role="listbox">
            {actions.map((a, idx) => {
              const showHeader = a.groupOrder !== lastGroup;
              lastGroup = a.groupOrder;
              return (
                <li key={a.id}>
                  {showHeader && (
                    <div className="ac-cmdk-group-head">
                      {GROUP_LABEL[a.groupOrder] || ""}
                    </div>
                  )}
                  <button
                    type="button"
                    data-idx={idx}
                    className={`ac-cmdk-item ${idx === selectedIdx ? "is-selected" : ""}`}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => runAction(a)}
                    role="option"
                    aria-selected={idx === selectedIdx}
                  >
                    <span className="ac-cmdk-item-label">{a.label}</span>
                    {a.hint && <span className="ac-cmdk-item-hint">{a.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="ac-cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> เลือก</span>
          <span><kbd>enter</kbd> เปิด</span>
          <span><kbd>esc</kbd> ปิด</span>
          <span className="ac-cmdk-foot-count">
            {counts.rooms} ห้อง · {counts.views} หน้า · {counts.commands} คำสั่ง
          </span>
        </div>
      </div>
    </div>
  );
}
