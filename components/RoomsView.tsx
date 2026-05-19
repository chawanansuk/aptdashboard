"use client";

import { useMemo, useState } from "react";
import type { Role } from "@/auth";
import type { RoomStatus, RoomView } from "@/types";
import { STATUS_LABEL, STATUS_DOT, STATUS_KEYS, FILTER_CHIPS } from "@/lib/constants";
import { useRoomDensity, ROOM_DENSITY_VALUES, type RoomDensity } from "@/lib/useRoomDensity";
import RoomQuickActions from "./RoomQuickActions";

interface Props {
  visibleRooms: RoomView[];
  activeFilter: "all" | RoomStatus;
  onChangeFilter: (f: "all" | RoomStatus) => void;
  search: string;
  onChangeSearch: (s: string) => void;
  bulkMode: boolean;
  bulkSelected: Set<string>;
  onToggleBulkMode: () => void;
  onToggleBulkRoom: (building: string, room: string) => void;
  onSelectRoom: (r: RoomView) => void;
  roles: Role[] | undefined;
  /** Quick-action callbacks — passed through to RoomQuickActions popover. */
  onRepairRoom: (r: RoomView) => void;
}

const DENSITY_LABEL: Record<RoomDensity, string> = {
  compact: "S",
  comfy: "M",
  large: "L",
};

const DENSITY_TITLE: Record<RoomDensity, string> = {
  compact: "เล็ก — แสดงห้องเยอะ",
  comfy: "ปกติ",
  large: "ใหญ่ — เห็นข้อมูลผู้เช่า",
};

export default function RoomsView({
  visibleRooms, activeFilter, onChangeFilter,
  search, onChangeSearch, bulkMode, bulkSelected, onToggleBulkMode, onToggleBulkRoom, onSelectRoom,
  roles, onRepairRoom,
}: Props) {
  const { density, setDensity } = useRoomDensity();
  const [quickFor, setQuickFor] = useState<{ room: RoomView; anchor: DOMRect } | null>(null);

  const floorGroups = useMemo(() => {
    const map = new Map<string, RoomView[]>();
    visibleRooms.forEach((r) => {
      const k = r.floor || "-";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    return Array.from(map.entries())
      .map(([floor, list]) => ({
        floor,
        list: list.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })),
      }))
      .sort((a, b) => (a.floor || "").localeCompare(b.floor || "", undefined, { numeric: true }));
  }, [visibleRooms]);

  function openQuick(e: React.MouseEvent, r: RoomView) {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    // Find the parent cell (.ac-rc) so the popover anchors there, not the dot button
    const cell = btn.closest(".ac-rc") as HTMLElement | null;
    const rect = (cell || btn).getBoundingClientRect();
    setQuickFor({ room: r, anchor: rect });
  }

  return (
    <>
      <section className="ac-fb">
        <div className="ac-chips">
          {FILTER_CHIPS.map((c) => (
            <button key={c.key} className={`ac-chip ${activeFilter === c.key ? "is-active" : ""}`} onClick={() => onChangeFilter(c.key)}>{c.label}</button>
          ))}
        </div>
        <div className="ac-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" placeholder="ค้นหา ห้อง / ตึก / ผู้เช่า / เบอร์..." value={search} onChange={(e) => onChangeSearch(e.target.value)} />
        </div>
        <div className="ac-density-toggle" role="group" aria-label="ขนาดห้อง">
          {ROOM_DENSITY_VALUES.map((d) => (
            <button
              key={d}
              type="button"
              className={`ac-density-btn ${density === d ? "is-active" : ""}`}
              onClick={() => setDensity(d)}
              title={DENSITY_TITLE[d]}
              aria-pressed={density === d}
            >{DENSITY_LABEL[d]}</button>
          ))}
        </div>
        <button
          className={`ac-btn ac-btn-sm ${bulkMode ? "ac-btn-primary" : "ac-btn-ghost"}`}
          onClick={onToggleBulkMode}
          title="เลือกหลายห้องพร้อมกัน"
        >{bulkMode ? "✕ ออกจากเลือก" : "☑ เลือกหลาย"}</button>
      </section>

      <section className="ac-legend">
        {STATUS_KEYS.map((s) => (
          <div key={s} className="ac-legend-item">
            <span className="ac-legend-dot" style={{ background: STATUS_DOT[s] }} />
            <span>{STATUS_LABEL[s]}</span>
          </div>
        ))}
        <div className="ac-legend-item"><span className="ac-legend-dot ac-legend-today" /><span>งานวันนี้</span></div>
      </section>

      {floorGroups.map((g) => {
        const counts: Record<RoomStatus, number> = { occupied: 0, ready: 0, pending: 0, moveout: 0, qc: 0, repair: 0, inactive: 0 };
        g.list.forEach((r) => counts[r.status]++);
        return (
          <section key={g.floor} className="ac-fs">
            <header className="ac-fs-head">
              <div className="ac-fs-title">ชั้น {g.floor}</div>
              <div className="ac-fs-stats">
                {(Object.keys(counts) as RoomStatus[]).map((k) => (counts[k] > 0 ? (
                  <span key={k} className="ac-fs-stat">
                    <span className="ac-fs-stat-dot" style={{ background: STATUS_DOT[k] }} />
                    {STATUS_LABEL[k]} {counts[k]}
                  </span>
                ) : null))}
              </div>
            </header>
            <div className={`ac-rg ac-rg-${density}`}>
              {g.list.map((r) => {
                const k = `${r.building}|${r.room}`;
                const checked = bulkSelected.has(k);
                return (
                  <div
                    key={`${r.building}-${r.room}`}
                    className={`ac-rc ac-rc-${r.status} ${bulkMode ? "is-bulk" : ""} ${checked ? "is-checked" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => bulkMode ? onToggleBulkRoom(r.building, r.room) : onSelectRoom(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        bulkMode ? onToggleBulkRoom(r.building, r.room) : onSelectRoom(r);
                      }
                    }}
                    title={`${r.building} ${r.room} • ${STATUS_LABEL[r.status]}`}
                  >
                    {r.today && <span className="ac-rc-today" />}
                    {bulkMode && <span className="ac-rc-check">{checked ? "✓" : ""}</span>}
                    <span className="ac-rc-num">{r.room}</span>
                    <span className="ac-rc-status">{STATUS_LABEL[r.status]}</span>
                    {!bulkMode && (
                      <button
                        type="button"
                        className="ac-rc-more"
                        onClick={(e) => openQuick(e, r)}
                        title="ตัวเลือกเพิ่มเติม"
                        aria-label={`Quick actions ${r.building} ${r.room}`}
                      >⋯</button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {quickFor && (
        <RoomQuickActions
          room={quickFor.room}
          anchor={quickFor.anchor}
          roles={roles}
          onClose={() => setQuickFor(null)}
          onOpenDetails={onSelectRoom}
          onRepair={onRepairRoom}
          onShowHistory={onSelectRoom}
          onShowTenant={onSelectRoom}
          onChangeStatus={onSelectRoom}
        />
      )}
    </>
  );
}
