"use client";

import { useMemo, useState } from "react";
import type { Role } from "@/auth";
import type { RoomStatus, RoomView, SheetRow } from "@/types";
import { STATUS_LABEL, STATUS_DOT, STATUS_KEYS, FILTER_CHIPS } from "@/lib/constants";
import { parseThaiDate } from "@/lib/dateUtils";
import { useRoomDensity, ROOM_DENSITY_VALUES, type RoomDensity } from "@/lib/useRoomDensity";
import { canViewTenant } from "@/lib/permissions";
import RoomQuickActions from "./RoomQuickActions";

/**
 * Format relative time (วันนี้ / พรุ่งนี้ / X วันที่แล้ว) — Thai.
 * Used in heatmap tooltip to give context on the most recent task
 * without forcing the user to click in.
 */
function relativeDateLabel(dmy: string, now: Date = new Date()): string {
  const d = parseThaiDate(dmy);
  if (!d) return dmy || "";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "วันนี้";
  if (diff === 1) return "พรุ่งนี้";
  if (diff === -1) return "เมื่อวาน";
  if (diff > 1)  return `อีก ${diff} วัน`;
  return `${Math.abs(diff)} วันที่แล้ว`;
}

/**
 * Pick the "most relevant" task to show in heatmap tooltip.
 *   Priority: today → upcoming → past (newest)
 */
function latestTaskFor(r: RoomView): { task: SheetRow; section: "วันนี้" | "ข้างหน้า" | "ผ่านไป" } | null {
  if (r.todayTasks.length > 0)    return { task: r.todayTasks[0],    section: "วันนี้" };
  if (r.upcomingTasks.length > 0) return { task: r.upcomingTasks[0], section: "ข้างหน้า" };
  if (r.pastTasks.length > 0)     return { task: r.pastTasks[0],     section: "ผ่านไป" };
  return null;
}

/**
 * Multi-line tooltip text for a heatmap room cell.
 * Browser-native `title` accepts \n for line breaks — no custom popover
 * needed for this level of detail.
 */
function buildRoomTooltip(r: RoomView): string {
  const lines: string[] = [
    `ห้อง ${r.room} · ${r.building}${r.floor ? ` · ชั้น ${r.floor}` : ""}`,
    `สถานะ: ${STATUS_LABEL[r.status]}`,
  ];
  const latest = latestTaskFor(r);
  if (latest) {
    lines.push(
      `งานล่าสุด (${latest.section}): ${latest.task.type}${
        latest.task.note ? ` · ${latest.task.note}` : ""
      }`,
      relativeDateLabel(latest.task.date),
    );
  }
  return lines.join("\n");
}

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
  /** Optional: vehicle count per room ("Building|Room" → count). When
   *  supplied, each card shows a `🏍 N` badge when N > 0. */
  vehicleCountByRoom?: (building: string, room: string) => number;
  /** Optional: equipment count per room — companion to vehicles.
   *  When supplied, cards show `🔧 N` badge when N > 0 (alongside
   *  vehicle badge if both > 0). */
  equipmentCountByRoom?: (building: string, room: string) => number;
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
  roles, onRepairRoom, vehicleCountByRoom, equipmentCountByRoom,
}: Props) {
  const { density, setDensity } = useRoomDensity();
  // Contract-expiring chip — only visible to roles that can see
  // tenant info (management). Contract date isn't strictly PII but
  // mirrors the gate to avoid sales/engineer seeing renewal cues.
  const canSeeTenant = canViewTenant(roles);
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
                    // Rich tooltip — multi-line, shows status + latest task
                    // + relative time. Browser-native title accepts \n so
                    // we don't need a custom popover for the basic info.
                    title={buildRoomTooltip(r)}
                    data-tooltip={buildRoomTooltip(r)}
                  >
                    {r.today && <span className="ac-rc-today" />}
                    {(() => {
                      if (!canSeeTenant || r.status !== "occupied" || !r.contractEnd) return null;
                      const d = parseThaiDate(r.contractEnd);
                      if (!d) return null;
                      const now = new Date();
                      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                      const days = Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                      if (days > 30 || days < -1) return null;
                      const tone = days < 0 ? "is-expired" : days <= 7 ? "is-soon" : "is-warn";
                      return (
                        <span
                          className={`ac-rc-contract ${tone}`}
                          title={
                            days < 0 ? `สัญญาหมดแล้ว ${Math.abs(days)} วัน`
                            : days === 0 ? "สัญญาหมดวันนี้"
                            : `สัญญาหมดในอีก ${days} วัน`
                          }
                          aria-label="สัญญาใกล้หมดหรือหมดแล้ว"
                        >⏰</span>
                      );
                    })()}
                    {bulkMode && <span className="ac-rc-check">{checked ? "✓" : ""}</span>}
                    <span className="ac-rc-num">{r.room}</span>
                    <span className="ac-rc-status">{STATUS_LABEL[r.status]}</span>
                    {(() => {
                      const veh = vehicleCountByRoom?.(r.building, r.room) ?? 0;
                      const eq  = equipmentCountByRoom?.(r.building, r.room) ?? 0;
                      if (veh === 0 && eq === 0) return null;
                      return (
                        <span className="ac-rc-badges">
                          {veh > 0 && (
                            <span
                              className="ac-rc-veh"
                              title={`ยานพาหนะ ${veh} คัน`}
                              aria-label={`มียานพาหนะ ${veh} คัน`}
                            >🏍 {veh}</span>
                          )}
                          {eq > 0 && (
                            <span
                              className="ac-rc-eq"
                              title={`อุปกรณ์ ${eq} ชิ้น`}
                              aria-label={`มีอุปกรณ์ ${eq} ชิ้น`}
                            >🔧 {eq}</span>
                          )}
                        </span>
                      );
                    })()}
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
