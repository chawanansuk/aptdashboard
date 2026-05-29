"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Role } from "@/auth";
import type { RoomStatus, RoomView, SheetRow } from "@/types";
import { STATUS_LABEL, STATUS_DOT, STATUS_KEYS, FILTER_CHIPS } from "@/lib/constants";
import { abbreviateBuilding } from "@/lib/buildingAbbrev";
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
    `สถานะ: ${STATUS_LABEL[r.status]}${r.needsCleaning ? " · 🧹 ต้องทำสะอาด" : ""}`,
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
  // Note: the in-page search used to live here too but duplicated ⌘K's
  // room search (both matched room/building/tenant/phone) — staff had
  // two ways to do the same thing. Removed in Problem #8; use the top
  // nav ⌘K button or the global shortcut to find a room.
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
  bulkMode, bulkSelected, onToggleBulkMode, onToggleBulkRoom, onSelectRoom,
  roles, onRepairRoom, vehicleCountByRoom, equipmentCountByRoom,
}: Props) {
  const { density, setDensity } = useRoomDensity();
  // Contract-expiring chip — only visible to roles that can see
  // tenant info (management). Contract date isn't strictly PII but
  // mirrors the gate to avoid sales/engineer seeing renewal cues.
  const canSeeTenant = canViewTenant(roles);
  const [quickFor, setQuickFor] = useState<{ room: RoomView; anchor: DOMRect } | null>(null);

  // Roving tabindex (Problem #15) — the grid is a single Tab stop; one
  // card holds tabIndex 0 and Arrow keys move focus between cells. Keeps
  // keyboard users from having to Tab through all 297 rooms. The active
  // card key is tracked here; onFocus syncs it (covers click + Tab-in).
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const roomKey = (r: RoomView) => `${r.building}|${r.room}`;

  /** Geometry-based arrow navigation — robust to density + wrapping
   *  since it measures rendered positions instead of guessing columns.
   *  Left/Right pick the nearest card on roughly the same row; Up/Down
   *  the nearest in the adjacent row, biased to the same x. */
  function moveFocus(currentEl: HTMLElement, key: string) {
    const root = gridRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".ac-rc"));
    const cur = currentEl.getBoundingClientRect();
    const cx = cur.left + cur.width / 2;
    const cy = cur.top + cur.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of cards) {
      if (el === currentEl) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      let ok = false;
      let score = 0;
      const rowTol = cur.height * 0.6;
      if (key === "ArrowRight") { ok = dx > 1 && Math.abs(dy) < rowTol; score = dx + Math.abs(dy) * 4; }
      else if (key === "ArrowLeft") { ok = dx < -1 && Math.abs(dy) < rowTol; score = -dx + Math.abs(dy) * 4; }
      else if (key === "ArrowDown") { ok = dy > 1; score = dy + Math.abs(dx) * 2; }
      else if (key === "ArrowUp") { ok = dy < -1; score = -dy + Math.abs(dx) * 2; }
      if (ok && score < bestScore) { bestScore = score; best = el; }
    }
    if (best) {
      best.focus();
      const k = best.getAttribute("data-room-key");
      if (k) setFocusKey(k);
    }
  }

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

  // Default tab stop = first card in render order (floor-sorted).
  const firstKey = floorGroups[0]?.list[0] ? roomKey(floorGroups[0].list[0]) : null;
  const activeFocusKey = focusKey ?? firstKey;

  // Reset focusKey when the focused room has dropped out of the list
  // (deleted, filter changed, etc.). Otherwise no rendered card holds
  // tabIndex 0 and the grid stops being keyboard-reachable.
  useEffect(() => {
    if (focusKey == null) return;
    const stillRendered = floorGroups.some((g) => g.list.some((r) => roomKey(r) === focusKey));
    if (!stillRendered) setFocusKey(null);
  }, [floorGroups, focusKey]);

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
        {/* Search moved to the top-nav ⌘K button — same scope (room/
            building/tenant/phone) with rank-based ordering and digit-
            only phone matching. See lib/commandPaletteSearch.ts. */}
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
        <button
          type="button"
          className="ac-btn ac-btn-ghost ac-btn-sm ac-no-print"
          onClick={() => window.print()}
          title="พิมพ์/บันทึก PDF (ใช้ปุ่ม Ctrl+P หรือ Cmd+P ก็ได้)"
        >🖨 พิมพ์</button>
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

      <div ref={gridRef}>
      {floorGroups.map((g) => {
        const counts: Record<RoomStatus, number> = { occupied: 0, ready: 0, pending: 0, moveout: 0, qc: 0, repair: 0, inactive: 0 };
        g.list.forEach((r) => counts[r.status]++);
        return (
          <section key={g.floor} className="ac-fs">
            <header className="ac-fs-head">
              <div className="ac-fs-title">ชั้น {g.floor}</div>
              <div className="ac-fs-stats">
                {(Object.keys(counts) as RoomStatus[]).map((k) => (counts[k] > 0 ? (
                  <button
                    key={k}
                    type="button"
                    className={`ac-fs-stat ${activeFilter === k ? "is-active" : ""}`}
                    onClick={() => onChangeFilter(activeFilter === k ? "all" : k)}
                    aria-pressed={activeFilter === k}
                    title={`กรองห้องสถานะ ${STATUS_LABEL[k]} (ชั้นนี้ ${counts[k]} ห้อง)`}
                  >
                    <span className="ac-fs-stat-dot" style={{ background: STATUS_DOT[k] }} />
                    {STATUS_LABEL[k]} {counts[k]}
                  </button>
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
                    data-room-key={k}
                    className={`ac-rc ac-rc-${r.status} ${bulkMode ? "is-bulk" : ""} ${checked ? "is-checked" : ""}`}
                    role="button"
                    // Roving tabindex — only the active cell is in the Tab
                    // order; Arrow keys move between cells (Problem #15).
                    tabIndex={k === activeFocusKey ? 0 : -1}
                    onFocus={() => setFocusKey(k)}
                    onClick={() => bulkMode ? onToggleBulkRoom(r.building, r.room) : onSelectRoom(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        bulkMode ? onToggleBulkRoom(r.building, r.room) : onSelectRoom(r);
                      } else if (e.key.startsWith("Arrow")) {
                        e.preventDefault();
                        moveFocus(e.currentTarget, e.key);
                      }
                    }}
                    // Rich tooltip — multi-line, shows status + latest task
                    // + relative time. Browser-native title accepts \n so
                    // we don't need a custom popover for the basic info.
                    title={buildRoomTooltip(r)}
                    data-tooltip={buildRoomTooltip(r)}
                    // Accessible name — Problem #3: room numbers repeat
                    // across buildings so the SR / voice-control hint
                    // has to spell out the building too.
                    aria-label={
                      `ห้อง ${r.room} อาคาร ${r.building}` +
                      (r.floor ? ` ชั้น ${r.floor}` : "") +
                      ` สถานะ ${STATUS_LABEL[r.status]}`
                    }
                  >
                    {r.today && <span className="ac-rc-today" />}
                    {r.needsCleaning && (
                      <span
                        className="ac-rc-clean"
                        title="ต้องทำสะอาดก่อนลูกค้าเข้า"
                        aria-label="ต้องทำสะอาด"
                      >🧹</span>
                    )}
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
                    <span className="ac-rc-bldg" aria-hidden>{abbreviateBuilding(r.building)}</span>
                    <span className="ac-rc-status">{STATUS_LABEL[r.status]}</span>
                    {/* "วันเข้า" hint for pending rooms — sales/management need
                        to plan ahead (PR per user request 2026-05-23). Picks
                        the nearest upcoming ย้ายเข้า task; falls back to
                        ชมห้อง if no move-in scheduled yet. */}
                    {r.status === "pending" && (() => {
                      const allUpcoming = [...(r.upcomingTasks || []), ...(r.todayTasks || [])];
                      let bestMovein: Date | null = null;
                      let bestView: Date | null = null;
                      for (const t of allUpcoming) {
                        const d = parseThaiDate(t.date);
                        if (!d) continue;
                        if (t.type === "ย้ายเข้า") {
                          if (!bestMovein || d.getTime() < bestMovein.getTime()) bestMovein = d;
                        } else if (t.type === "ชมห้อง") {
                          if (!bestView || d.getTime() < bestView.getTime()) bestView = d;
                        }
                      }
                      const target = bestMovein ?? bestView;
                      if (!target) return null;
                      const icon = bestMovein ? "📥" : "👀";
                      const label = bestMovein ? "วันเข้า" : "นัดชม";
                      const dd = String(target.getDate()).padStart(2, "0");
                      const mm = String(target.getMonth() + 1).padStart(2, "0");
                      return (
                        <span
                          className="ac-rc-movein"
                          title={`${label} ${dd}/${mm}/${target.getFullYear()}`}
                          aria-label={`${label} ${dd}/${mm}`}
                        >{icon} {dd}/{mm}</span>
                      );
                    })()}
                    {/* "ต้องซ่อมอะไร" hint for repair rooms — a room flagged
                        รอเข้าซ่อม is meaningless to the technician without the
                        actual problem. Pull it from the room's ซ่อม task; if
                        none exists, say so plainly (flagged but no job yet). */}
                    {r.status === "repair" && (() => {
                      const all = [...(r.todayTasks || []), ...(r.upcomingTasks || []), ...(r.pastTasks || [])];
                      const repair = all.find((t) => t.type === "ซ่อม");
                      if (repair) {
                        const detail = (repair.note || "").trim() || "งานซ่อม";
                        return (
                          <span
                            className="ac-rc-repair-hint"
                            title={`ต้องซ่อม: ${detail}`}
                            aria-label={`ต้องซ่อม: ${detail}`}
                          >🔧 {detail}</span>
                        );
                      }
                      return (
                        <span
                          className="ac-rc-repair-hint is-empty"
                          title="ห้องนี้ถูกตั้งเป็น 'รอเข้าซ่อม' แต่ยังไม่มีใบงานซ่อม — สร้างงานซ่อมเพื่อบอกช่างว่าต้องซ่อมอะไร"
                          aria-label="ยังไม่มีใบงานซ่อม"
                        >🔧 ยังไม่มีใบงาน</span>
                      );
                    })()}
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
      </div>

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
