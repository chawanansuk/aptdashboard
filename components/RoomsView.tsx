"use client";

import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "./EmptyState";
import type { Role } from "@/auth";
import type { RoomStatus, RoomView, SheetRow } from "@/types";
import { STATUS_LABEL, STATUS_DOT, STATUS_KEYS, FILTER_CHIPS } from "@/lib/constants";
import { abbreviateBuilding } from "@/lib/buildingAbbrev";
import { parseThaiDate } from "@/lib/dateUtils";
import { relativeThaiDate } from "@/lib/relativeDate";
import { roomKey as makeRoomKey } from "@/lib/taskKey";
import { buildingSortIndex } from "@/lib/salesData";
import { useRoomDensity, ROOM_DENSITY_VALUES, type RoomDensity } from "@/lib/useRoomDensity";
import { canViewTenant } from "@/lib/permissions";
import RoomQuickActions from "./RoomQuickActions";

/**
 * Format relative time (วันนี้ / พรุ่งนี้ / X วันที่แล้ว) — Thai.
 * Used in heatmap tooltip to give context on the most recent task
 * without forcing the user to click in.
 */
/** Heatmap tooltip uses the no-clamp variant — every day diff shown
 *  literally ("อีก 120 วัน") because the tooltip is meant to be precise. */
const relativeDateLabel = (dmy: string, now: Date = new Date()): string =>
  relativeThaiDate(dmy, { now });

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

/* ====================================================================
 * RoomCard — one grid cell, memoized (perf r7).
 *
 * The grid holds ~300 cards and each render builds a multi-line tooltip
 * + runs several regex date-parses. mergeRoomsAndTasks preserves object
 * identity for unchanged rooms, so after an optimistic single-room
 * write only that room's card re-renders; the other ~299 bail here.
 *
 * The comparator checks DATA props only — the callback props are
 * closures that change identity every parent render but are behaviorally
 * keyed by bulkMode (compared) and stable handlers, so skipping them is
 * safe and is the whole point of the memo.
 * ==================================================================== */
interface RoomCardProps {
  r: RoomView;
  k: string;
  checked: boolean;
  bulkMode: boolean;
  isFocusTarget: boolean;
  canSeeTenant: boolean;
  veh: number;
  eq: number;
  onFocusKey: (k: string) => void;
  onActivate: (r: RoomView) => void;
  onArrowNav: (el: HTMLElement, key: string) => void;
  onOpenQuick: (e: React.MouseEvent, r: RoomView) => void;
}

const RoomCard = memo(function RoomCard({
  r, k, checked, bulkMode, isFocusTarget, canSeeTenant, veh, eq,
  onFocusKey, onActivate, onArrowNav, onOpenQuick,
}: RoomCardProps) {
  // Built once per (changed) card render — was built twice inline.
  const tooltip = buildRoomTooltip(r);
  return (
    <div
      data-room-key={k}
      className={`ac-rc ac-rc-${r.status} ${bulkMode ? "is-bulk" : ""} ${checked ? "is-checked" : ""}`}
      role="button"
      // Roving tabindex — only the active cell is in the Tab order;
      // Arrow keys move between cells (Problem #15).
      tabIndex={isFocusTarget ? 0 : -1}
      onFocus={() => onFocusKey(k)}
      onClick={() => onActivate(r)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate(r);
        } else if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          onArrowNav(e.currentTarget, e.key);
        }
      }}
      // Rich tooltip — multi-line, shows status + latest task + relative
      // time. Browser-native title accepts \n.
      title={tooltip}
      data-tooltip={tooltip}
      // Accessible name — room numbers repeat across buildings so the
      // SR / voice-control hint spells out the building too.
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
      {/* "วันเข้า" hint for pending rooms — nearest upcoming ย้ายเข้า,
          falls back to ชมห้อง if no move-in scheduled yet. */}
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
      {/* "ต้องซ่อมอะไร" hint for repair rooms. */}
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
      {(veh > 0 || eq > 0) && (
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
      )}
      {!bulkMode && (
        <button
          type="button"
          className="ac-rc-more"
          onClick={(e) => onOpenQuick(e, r)}
          title="ตัวเลือกเพิ่มเติม"
          aria-label={`Quick actions ${r.building} ${r.room}`}
        >⋯</button>
      )}
    </div>
  );
}, (prev, next) =>
  // Data props only — see block comment above.
  prev.r === next.r &&
  prev.k === next.k &&
  prev.checked === next.checked &&
  prev.bulkMode === next.bulkMode &&
  prev.isFocusTarget === next.isFocusTarget &&
  prev.canSeeTenant === next.canSeeTenant &&
  prev.veh === next.veh &&
  prev.eq === next.eq,
);

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
  /** One-tap status hop from the ⋯ popover (v3.23) — see RoomQuickActions. */
  onQuickStatus?: (r: RoomView, rawStatus: string) => Promise<void>;
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

function RoomsView({
  visibleRooms, activeFilter, onChangeFilter,
  bulkMode, bulkSelected, onToggleBulkMode, onToggleBulkRoom, onSelectRoom,
  roles, onRepairRoom, onQuickStatus, vehicleCountByRoom, equipmentCountByRoom,
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
  const roomKey = (r: RoomView) => makeRoomKey(r.building, r.room);

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

  // When more than one building is in view (the "ทั้งหมด" tab), room
  // numbers repeat across buildings (KL 202 vs มั่งมี 202) so a pure
  // floor grouping lumps unrelated rooms together. Detect that and
  // group building → floor, with a building header per group. A single
  // selected building keeps the flat floor-only layout (building label
  // would be redundant).
  const multiBuilding = useMemo(
    () => new Set(visibleRooms.map((r) => r.building)).size > 1,
    [visibleRooms],
  );

  const floorGroups = useMemo(() => {
    const map = new Map<string, { building: string; floor: string; list: RoomView[] }>();
    visibleRooms.forEach((r) => {
      const building = r.building || "—";
      const floor = r.floor || "-";
      const k = `${building}|${floor}`;
      if (!map.has(k)) map.set(k, { building, floor, list: [] });
      map.get(k)!.list.push(r);
    });
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        list: g.list.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })),
      }))
      // Building order first (sales preference), then floor ascending. When
      // only one building is present this collapses to a plain floor sort.
      .sort((a, b) =>
        buildingSortIndex(a.building) - buildingSortIndex(b.building) ||
        a.building.localeCompare(b.building) ||
        (a.floor || "").localeCompare(b.floor || "", undefined, { numeric: true }));
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

  /** Card activation — bulk-toggle in bulk mode, open modal otherwise.
   *  Identity changes with bulkMode; the RoomCard comparator already
   *  compares bulkMode, so cards re-render exactly when this changes
   *  behavior. */
  function activateRoom(r: RoomView) {
    if (bulkMode) onToggleBulkRoom(r.building, r.room);
    else onSelectRoom(r);
  }

  function openQuick(e: React.MouseEvent, r: RoomView) {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    // Find the parent cell (.ac-rc) so the popover anchors there, not the dot button
    const cell = btn.closest(".ac-rc") as HTMLElement | null;
    const rect = (cell || btn).getBoundingClientRect();
    setQuickFor({ room: r, anchor: rect });
  }

  // r30 (Prom Design "disclosure for abundance"): ยุบ/ขยายรายตึก จำสถานะใน
  // localStorage — 5 ตึก × หลายชั้น บนมือถือยาวมาก ยุบตึกที่ไม่ได้ดูได้
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("collapsedBuildings") : null;
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set<string>(); }
  });
  const toggleBuilding = (b: string) => {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(b)) next.delete(b); else next.add(b);
      try { window.localStorage.setItem("collapsedBuildings", JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  };

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
      {floorGroups.length === 0 && (
        /* QA r27: หน้าสถานะห้อง (เช่น รอตรวจ/QC = 0 ห้อง) เดิมว่างเปล่าใต้
           แถบฟิลเตอร์ ไม่มีข้อความอะไรเลย */
        <EmptyState
          icon="search"
          title="ไม่มีห้องตามเงื่อนไขนี้ตอนนี้"
          description="ลองเปลี่ยนตัวกรองสถานะด้านบน หรือเลือกตึกอื่นจากแถบบนสุด"
          action={activeFilter !== "all" ? { label: "ดูทุกสถานะ", onClick: () => onChangeFilter("all") } : undefined}
        />
      )}
      {floorGroups.map((g, idx) => {
        const counts: Record<RoomStatus, number> = { occupied: 0, ready: 0, pending: 0, moveout: 0, qc: 0, repair: 0, inactive: 0 };
        g.list.forEach((r) => counts[r.status]++);
        // Building divider — render once before the first floor section of
        // each building, only when multiple buildings are in view.
        const showBuildingHeader =
          multiBuilding && (idx === 0 || floorGroups[idx - 1].building !== g.building);
        const buildingRoomCount = multiBuilding
          ? floorGroups.filter((x) => x.building === g.building).reduce((n, x) => n + x.list.length, 0)
          : 0;
        return (
          <Fragment key={`${g.building}|${g.floor}`}>
          {showBuildingHeader && (
            <header
              className={`ac-bld-head ${collapsed.has(g.building) ? "is-collapsed" : ""}`}
              role="button"
              tabIndex={0}
              aria-expanded={!collapsed.has(g.building)}
              onClick={() => toggleBuilding(g.building)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleBuilding(g.building); } }}
              title={collapsed.has(g.building) ? "ขยายตึกนี้" : "ยุบตึกนี้"}
            >
              <span className="ac-bld-name">{g.building}</span>
              <span className="ac-bld-count">{buildingRoomCount} ห้อง</span>
              <span className="ac-bld-chevron" aria-hidden>▾</span>
            </header>
          )}
          {multiBuilding && collapsed.has(g.building) ? null : (
          <section className="ac-fs">
            <header className="ac-fs-head">
              <div className="ac-fs-title">ชั้น {g.floor}</div>
              <div className="ac-fs-stats">
                {/* STATUS_KEYS (a stable module constant) instead of
                    Object.keys(counts), which allocated a fresh array for
                    every floor on every render. Same fixed order. */}
                {STATUS_KEYS.map((k) => (counts[k] > 0 ? (
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
                const k = makeRoomKey(r.building, r.room);
                return (
                  <RoomCard
                    key={k}
                    r={r}
                    k={k}
                    checked={bulkSelected.has(k)}
                    bulkMode={bulkMode}
                    isFocusTarget={k === activeFocusKey}
                    canSeeTenant={canSeeTenant}
                    veh={vehicleCountByRoom?.(r.building, r.room) ?? 0}
                    eq={equipmentCountByRoom?.(r.building, r.room) ?? 0}
                    onFocusKey={setFocusKey}
                    onActivate={activateRoom}
                    onArrowNav={moveFocus}
                    onOpenQuick={openQuick}
                  />
                );
              })}
            </div>
          </section>
          )}
          </Fragment>
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
          onQuickStatus={onQuickStatus}
        />
      )}
    </>
  );
}

/** Memoized so a parent re-render (poll tick, search keystroke,
 *  unrelated state change) doesn't reconcile the whole room grid when
 *  inputs are unchanged. Default shallow compare is enough — props are
 *  primitives + the rooms array, which keeps a stable identity across
 *  no-change polls once the upstream ETag/304 skips a setTasks. */
export default memo(RoomsView);
