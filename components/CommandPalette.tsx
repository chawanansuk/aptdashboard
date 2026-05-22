"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Role } from "@/auth";
import type { RoomView } from "@/types";
import type { Route } from "@/lib/permissions";
import {
  buildActions, searchRooms, searchViews, searchCommands,
  type CommandDef, type PaletteAction, type VehicleHit,
} from "@/lib/commandPaletteSearch";
import { Icon } from "@/lib/icons";

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
  // -1 reserved for "ล่าสุด" (recent) — see RECENT_GROUP_ORDER below
  [-1]: "ล่าสุด",
  0: "ห้อง",
  1: "หน้า",
  2: "คำสั่ง",
};

/** localStorage key for recent palette selections. v1 schema. */
const RECENT_KEY = "aptdash:cmdkRecent:v1";
const RECENT_MAX = 5;

/** Stored recent entry — minimal so we can survive schema changes. */
interface RecentEntry {
  id: string;          // PaletteAction.id
  type: PaletteAction["type"];
  label: string;       // snapshot at the time it was used
  hint?: string;
}

function loadRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecent(a: PaletteAction): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadRecent().filter((r) => r.id !== a.id);
    const next: RecentEntry[] = [
      { id: a.id, type: a.type, label: a.label, hint: a.hint },
      ...existing,
    ].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // quota exceeded / private mode — ignore
  }
}

export default function CommandPalette({
  open, onClose, rooms, roles, commands, onSelectRoom, onChangeView,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Vehicles for plate/model search — fetched lazily the first time
  // the palette opens. Stays in state across opens so we don't refetch
  // on every Cmd+K. Background refresh skipped (low churn data).
  const [vehicles, setVehicles] = useState<VehicleHit[]>([]);
  const vehiclesLoadedRef = useRef(false);

  // Lazy-fetch vehicles on first open. Single fetch per session is
  // enough — vehicle data changes rarely (move-in/out, new bike). If
  // the user adds a vehicle via the page and immediately searches in
  // Cmd+K, they won't see it until a refresh — acceptable tradeoff
  // for now (vs. polling or invalidating on write).
  useEffect(() => {
    if (!open || vehiclesLoadedRef.current) return;
    vehiclesLoadedRef.current = true;
    let cancelled = false;
    fetch("/api/vehicles", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rows = (data?.rows || []) as VehicleHit[];
        setVehicles(rows);
      })
      .catch(() => {
        // Silent fail — palette still works without vehicle search.
        // Reset so a later open retries.
        vehiclesLoadedRef.current = false;
      });
    return () => { cancelled = true; };
  }, [open]);

  // Reset when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      // Dev-only diagnostic — surface the distinct building names that
      // came back from the sheet, so we can see if "มีทรัพย์" rooms
      // are simply missing from upstream data vs. being a search bug
      // (Task 12). Production keeps the console quiet.
      if (process.env.NODE_ENV !== "production") {
        const distinct = Array.from(new Set(rooms.map((r) => r.building))).sort();
        const countsByBuilding = distinct.map(
          (b) => `${b}=${rooms.filter((r) => r.building === b).length}`,
        );
        // eslint-disable-next-line no-console
        console.log(`[cmdk] distinct buildings (${distinct.length}): ${countsByBuilding.join(", ")}`);
      }
      // focus input after the paint
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open, rooms]);

  const actions = useMemo<PaletteAction[]>(() => {
    if (!open) return [];
    const base = buildActions({ rooms, roles, commands, query, onSelectRoom, onChangeView, vehicles });
    // When the user hasn't typed yet, surface recent selections at the top.
    // Skip recents that no longer resolve (e.g. room deleted) so we don't
    // confuse the user with dead links.
    if (!query.trim()) {
      const recents = loadRecent();
      const validIds = new Set(base.map((a) => a.id));
      const recentActions: PaletteAction[] = recents
        .filter((r) => validIds.has(r.id) || r.type === "command")
        .map((r) => ({
          type: r.type,
          id: r.id,
          label: r.label,
          hint: r.hint,
          groupOrder: -1,
          rank: 0,
        }));
      // Recents first; deduplicate against base (so the same action doesn't
      // appear in both "Recent" and its native section)
      const recentIds = new Set(recentActions.map((r) => r.id));
      const deduped = base.filter((a) => !recentIds.has(a.id));
      return [...recentActions, ...deduped];
    }
    return base;
  }, [open, rooms, roles, commands, query, onSelectRoom, onChangeView, vehicles]);

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
    // Track this selection as a recent item so the next open shows it
    // at the top (when query is empty)
    pushRecent(a);
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
          <span className="ac-cmdk-icon" aria-hidden><Icon name="search" size={16} /></span>
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
