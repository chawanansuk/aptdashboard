"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RoomEquipment, MaintenanceStatus } from "@/types";
import {
  EQUIPMENT_TYPES, EQUIPMENT_TYPE_ICON, EQUIPMENT_STATUS_COLOR,
  MAINTENANCE_STATUS_COLOR,
} from "@/lib/constants";
import {
  computeNextService, getMaintenanceStatus, daysUntilService, formatDateLabel,
  maintenanceGroup, type MaintenanceGroup,
} from "@/lib/maintenanceUtils";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import { exportCsv } from "@/lib/csvExport";

interface Props {
  activeBuilding: string;
  onScheduleService: (building: string, room: string, note: string) => void;
}

type GroupFilter = "all" | MaintenanceGroup;

// 3 technician-facing buckets instead of the 5 raw statuses — "do I act?"
const GROUP_FILTERS: { key: GroupFilter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "action", label: "ต้องบำรุง" },
  { key: "ok", label: "ตามรอบ" },
  { key: "pending", label: "รอข้อมูล" },
];

// Color per group — action borrows the urgency palette (danger when any
// row is overdue, amber otherwise); pending is muted (admin data gap).
const GROUP_COLOR: Record<MaintenanceGroup, string> = {
  action: MAINTENANCE_STATUS_COLOR["due-soon"],
  ok: MAINTENANCE_STATUS_COLOR.ok,
  pending: MAINTENANCE_STATUS_COLOR.unknown,
};

const STATUS_ORDER: Record<MaintenanceStatus, number> = {
  overdue: 0,
  "due-soon": 1,
  // needs-date sits above "ok" — it's actionable (admin must fill a
  // date) so it shouldn't hide below the healthy rows.
  "needs-date": 2,
  ok: 3,
  unknown: 4,
};

export default function MaintenanceView({ activeBuilding, onScheduleService }: Props) {
  const [rows, setRows] = useState<RoomEquipment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GroupFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const load = useCallback(async (opts?: { signal?: AbortSignal }) => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/maintenance-plan", { cache: "no-store", signal: opts?.signal });
      const j = await res.json().catch(() => ({ error: "invalid JSON" }));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const list: RoomEquipment[] = Array.isArray(j.rows) ? j.rows : [];
      if (opts?.signal?.aborted) return;
      setRows(list);
    } catch (e) {
      if (opts?.signal?.aborted) return;
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      if (!opts?.signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  /** Filtered + sorted equipment list (respects activeBuilding + filters). */
  const filtered = useMemo(() => {
    if (!rows) return [];
    const list = rows.filter((eq) => {
      if (activeBuilding !== "ทั้งหมด" && eq.building !== activeBuilding) return false;
      if (typeFilter !== "all" && eq.type !== typeFilter) return false;
      const g = maintenanceGroup(getMaintenanceStatus(eq));
      if (statusFilter !== "all" && g !== statusFilter) return false;
      return true;
    });
    return list.sort((a, b) => {
      const sa = STATUS_ORDER[getMaintenanceStatus(a)];
      const sb = STATUS_ORDER[getMaintenanceStatus(b)];
      if (sa !== sb) return sa - sb;
      const da = daysUntilService(a);
      const db = daysUntilService(b);
      if (da !== null && db !== null) return da - db;
      if (da !== null) return -1;
      if (db !== null) return 1;
      return (a.building + a.room).localeCompare(b.building + b.room);
    });
  }, [rows, activeBuilding, statusFilter, typeFilter]);

  /** Top-of-page summary counts — respect activeBuilding but ignore filters
   *  (so user always sees the bigger picture even after filtering).
   *  3 buckets; `overdue` tracked only to color the "ต้องบำรุง" card red. */
  const counts = useMemo(() => {
    if (!rows) return { action: 0, ok: 0, pending: 0, overdue: 0, total: 0 };
    let action = 0, ok = 0, pending = 0, overdue = 0, total = 0;
    for (const eq of rows) {
      if (activeBuilding !== "ทั้งหมด" && eq.building !== activeBuilding) continue;
      total++;
      const m = getMaintenanceStatus(eq);
      const g = maintenanceGroup(m);
      if (g === "action") action++;
      else if (g === "ok") ok++;
      else pending++;
      if (m === "overdue") overdue++;
    }
    return { action, ok, pending, overdue, total };
  }, [rows, activeBuilding]);

  /** The "ต้องบำรุง" lead list — every actionable item (overdue + due-soon),
   *  most-overdue first. Answers the technician's "what do I service?" up
   *  front. Respects type filter but always shows the action bucket. */
  const actionItems = useMemo(() => {
    const list: Array<{ eq: RoomEquipment; days: number | null }> = [];
    for (const eq of rows ?? []) {
      if (activeBuilding !== "ทั้งหมด" && eq.building !== activeBuilding) continue;
      if (typeFilter !== "all" && eq.type !== typeFilter) continue;
      if (maintenanceGroup(getMaintenanceStatus(eq)) !== "action") continue;
      list.push({ eq, days: daysUntilService(eq) });
    }
    return list.sort((a, b) => (a.days ?? 0) - (b.days ?? 0)).slice(0, 8);
  }, [rows, activeBuilding, typeFilter]);

  /** Type chips, scoped to activeBuilding, hiding types with no equipment
   *  (keeps the row short when a building has few item kinds). */
  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const eq of rows ?? []) {
      if (activeBuilding !== "ทั้งหมด" && eq.building !== activeBuilding) continue;
      map.set(eq.type, (map.get(eq.type) ?? 0) + 1);
    }
    return map;
  }, [rows, activeBuilding]);

  /** Group filtered items by building when user has "all buildings" set.
   *  When user has a specific building selected, we render flat — the
   *  building label would be redundant. */
  const buildingGroups = useMemo(() => {
    if (activeBuilding !== "ทั้งหมด") {
      return null; // signal: render flat
    }
    const map = new Map<string, RoomEquipment[]>();
    for (const eq of filtered) {
      if (!map.has(eq.building)) map.set(eq.building, []);
      map.get(eq.building)!.push(eq);
    }
    return Array.from(map.entries())
      .map(([building, items]) => {
        let bOverdue = 0, bSoon = 0;
        for (const eq of items) {
          const m = getMaintenanceStatus(eq);
          if (m === "overdue") bOverdue++;
          else if (m === "due-soon") bSoon++;
        }
        return { building, items, overdue: bOverdue, soon: bSoon };
      })
      .sort((a, b) => {
        // Buildings with overdue items first; within tier, sort alphabetically
        if (a.overdue !== b.overdue) return b.overdue - a.overdue;
        return a.building.localeCompare(b.building);
      });
  }, [filtered, activeBuilding]);

  function handleExport() {
    if (filtered.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const tag = activeBuilding === "ทั้งหมด" ? "ทั้งหมด" : activeBuilding;
    exportCsv(
      `อุปกรณ์_${tag}_${today}.csv`,
      filtered,
      [
        { header: "ตึก",          value: (e: RoomEquipment) => e.building },
        { header: "ห้อง",         value: (e: RoomEquipment) => e.room },
        { header: "ประเภท",       value: (e: RoomEquipment) => e.type },
        { header: "ยี่ห้อ/รุ่น",    value: (e: RoomEquipment) => e.brand },
        { header: "วันติดตั้ง",    value: (e: RoomEquipment) => e.installDate },
        { header: "วันซ่อมล่าสุด",  value: (e: RoomEquipment) => e.lastService },
        { header: "สถานะ",        value: (e: RoomEquipment) => e.status },
        { header: "รอบบำรุง(วัน)", value: (e: RoomEquipment) => e.intervalDays || "" },
        { header: "หมายเหตุ",     value: (e: RoomEquipment) => e.note },
      ],
    );
  }

  return (
    <div className="ac-maintenance">
      <div className="ac-maintenance-toolbar">
        <button
          type="button"
          className="ac-btn ac-btn-ghost ac-btn-sm"
          onClick={handleExport}
          disabled={filtered.length === 0}
          title={filtered.length === 0 ? "ไม่มีข้อมูล" : `ดาวน์โหลด ${filtered.length} รายการ`}
        >⬇ CSV</button>
      </div>
      <div className="ac-maintenance-summary">
        <div className="ac-maint-stat" style={{ borderColor: counts.overdue > 0 ? MAINTENANCE_STATUS_COLOR.overdue : GROUP_COLOR.action }}>
          <div className="ac-maint-stat-num" style={{ color: counts.overdue > 0 ? MAINTENANCE_STATUS_COLOR.overdue : GROUP_COLOR.action }}>{counts.action}</div>
          <div className="ac-maint-stat-label">ต้องบำรุง</div>
        </div>
        <div className="ac-maint-stat" style={{ borderColor: GROUP_COLOR.ok }}>
          <div className="ac-maint-stat-num" style={{ color: GROUP_COLOR.ok }}>{counts.ok}</div>
          <div className="ac-maint-stat-label">ตามรอบ</div>
        </div>
        {counts.pending > 0 && (
          <div className="ac-maint-stat" style={{ borderColor: GROUP_COLOR.pending }}>
            <div className="ac-maint-stat-num" style={{ color: GROUP_COLOR.pending }}>{counts.pending}</div>
            <div className="ac-maint-stat-label">รอข้อมูล</div>
          </div>
        )}
      </div>

      {/* All-clear: nothing needs servicing right now — tell the technician
          plainly so an empty action list doesn't read as "something's wrong". */}
      {rows && counts.total > 0 && counts.action === 0 && (
        <div className="ac-banner ac-banner-ok" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden>✓</span>
          <span>ไม่มีอุปกรณ์ที่ต้องบำรุงตอนนี้ — ทุกชิ้นยังอยู่ในรอบ</span>
        </div>
      )}

      {/* Lead list — "what do I service?" surfaced first */}
      {actionItems.length > 0 && (
        <section className="ac-maint-week" aria-label="อุปกรณ์ที่ต้องบำรุง">
          <div className="ac-maint-week-head">
            <span className="ac-maint-week-title">🔧 ต้องบำรุงก่อน</span>
            <span className="ac-maint-week-sub">{actionItems.length} รายการ (เรียงด่วนสุดก่อน)</span>
          </div>
          <ul className="ac-maint-week-list">
            {actionItems.map(({ eq, days }) => {
              const dueClass =
                days !== null && days < 0 ? "is-overdue" :
                days === 0 ? "is-today" : "is-soon";
              const dueLabel =
                days === null ? "—" :
                days < 0 ? `เลย ${Math.abs(days)} วัน` :
                days === 0 ? "วันนี้" :
                `อีก ${days} วัน`;
              return (
                <li key={eq.id} className="ac-maint-week-item">
                  <span className="ac-maint-week-item-icon" aria-hidden>
                    {EQUIPMENT_TYPE_ICON[eq.type] || "🔧"}
                  </span>
                  <div>
                    <div className="ac-maint-week-item-where">
                      {eq.building} {eq.room} · {eq.type}
                    </div>
                    <div className="ac-maint-week-item-meta">
                      {eq.brand || "—"}
                    </div>
                  </div>
                  <span className={`ac-maint-week-item-due ${dueClass}`}>{dueLabel}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="ac-chips">
        {GROUP_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`ac-chip ${statusFilter === f.key ? "is-active" : ""}`}
            onClick={() => setStatusFilter(f.key)}
          >{f.label}</button>
        ))}
      </div>

      <div className="ac-chips" style={{ marginTop: 6 }}>
        <button
          className={`ac-chip ${typeFilter === "all" ? "is-active" : ""}`}
          onClick={() => setTypeFilter("all")}
        >ทุกประเภท</button>
        {EQUIPMENT_TYPES.map((t) => {
          const count = typeCounts.get(t) ?? 0;
          if (count === 0 && typeFilter !== t) return null;
          return (
            <button
              key={t}
              className={`ac-chip ${typeFilter === t ? "is-active" : ""}`}
              onClick={() => setTypeFilter(t)}
            >{EQUIPMENT_TYPE_ICON[t] || ""} {t} ({count})</button>
          );
        })}
      </div>

      {err && <div className="ac-banner ac-banner-warn">{err}</div>}

      {loading && !rows && (
        <LoadingState label="กำลังโหลดแผนบำรุง..." />
      )}

      {!loading && rows && filtered.length === 0 && (
        <EmptyState
          icon={statusFilter === "all" && typeFilter === "all" ? "maintenance" : "search"}
          tone={statusFilter === "all" && typeFilter === "all" ? "neutral" : "warning"}
          title={
            statusFilter === "all" && typeFilter === "all"
              ? "ยังไม่มีรายการบำรุงรักษา"
              : "ไม่มีอุปกรณ์ตามตัวกรองนี้"
          }
          description={
            statusFilter === "all" && typeFilter === "all"
              ? "เริ่มต้นด้วยการเพิ่มอุปกรณ์ที่ต้องตรวจสอบในห้อง — แอร์ ตู้เย็น เครื่องซักผ้า — ระบบจะแจ้งเตือนเมื่อใกล้ถึงรอบบำรุง"
              : "ลองเลือกตัวกรองสถานะหรือประเภทอื่น เพื่อดูรายการอุปกรณ์ทั้งหมด"
          }
        />
      )}

      {/* Grouped (all buildings) vs flat (single building) rendering */}
      {buildingGroups ? (
        buildingGroups.map((group) => (
          <BuildingGroup
            key={group.building}
            building={group.building}
            overdue={group.overdue}
            soon={group.soon}
            items={group.items}
            onScheduleService={onScheduleService}
          />
        ))
      ) : (
        <ul className="ac-maintenance-list">
          {filtered.map((eq) => (
            <MaintCard key={eq.id} eq={eq} onScheduleService={onScheduleService} />
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Building group section                                                */
/* -------------------------------------------------------------------- */

function BuildingGroup({
  building, overdue, soon, items, onScheduleService,
}: {
  building: string;
  overdue: number;
  soon: number;
  items: RoomEquipment[];
  onScheduleService: (building: string, room: string, note: string) => void;
}) {
  return (
    <>
      <header className="ac-maint-group-head">
        <span className="ac-maint-group-title">{building}</span>
        <span className="ac-maint-group-count">{items.length} ชิ้น</span>
        {(overdue > 0 || soon > 0) && (
          <span className="ac-maint-group-counts">
            {overdue > 0 && (
              <span className="ac-maint-group-counts-pill is-overdue">
                เลย {overdue}
              </span>
            )}
            {soon > 0 && (
              <span className="ac-maint-group-counts-pill is-soon">
                ใกล้ {soon}
              </span>
            )}
          </span>
        )}
      </header>
      <ul className="ac-maintenance-list">
        {items.map((eq) => (
          <MaintCard key={eq.id} eq={eq} onScheduleService={onScheduleService} />
        ))}
      </ul>
    </>
  );
}

/* -------------------------------------------------------------------- */
/* Single maintenance card                                               */
/* -------------------------------------------------------------------- */

function MaintCard({
  eq, onScheduleService,
}: {
  eq: RoomEquipment;
  onScheduleService: (building: string, room: string, note: string) => void;
}) {
  const m = getMaintenanceStatus(eq);
  const g = maintenanceGroup(m);
  const groupLabel = g === "action" ? "ต้องบำรุง" : g === "ok" ? "ตามรอบ" : "รอข้อมูล";
  const next = computeNextService(eq);
  const days = daysUntilService(eq);
  const mColor = MAINTENANCE_STATUS_COLOR[m] || "#94A3B8";
  const eqColor = EQUIPMENT_STATUS_COLOR[eq.status] || "#94A3B8";
  // The condition badge only earns space when something's actually wrong —
  // "ปกติ" is the default and just adds noise next to the cycle status.
  const showCondition = !!eq.status && eq.status !== "ปกติ";
  const tail =
    days === null ? "" :
    days < 0 ? ` (เลย ${Math.abs(days)} วัน)` :
    days === 0 ? " (วันนี้)" :
    ` (อีก ${days} วัน)`;
  const noteForTask =
    `บำรุงตามรอบ · ${eq.type}` +
    (eq.brand ? ` ${eq.brand}` : "") +
    (next ? ` · กำหนด ${formatDateLabel(next)}` : "");

  // Conditional class so overdue cards have a red left border
  const urgencyClass =
    m === "overdue" ? "is-overdue" :
    m === "due-soon" ? "is-due-soon" : "";

  return (
    <li className={`ac-maint-card ${urgencyClass}`}>
      <div className="ac-maint-card-icon">{EQUIPMENT_TYPE_ICON[eq.type] || "🔧"}</div>
      <div className="ac-maint-card-main">
        <div className="ac-maint-card-line1">
          <strong>{eq.building} {eq.room}</strong>
          <span className="ac-maint-card-type">· {eq.type}</span>
          {eq.brand && <span className="ac-maint-card-brand">· {eq.brand}</span>}
        </div>
        <div className="ac-maint-card-badges">
          <span
            className="ac-equipment-card-status"
            style={{ background: mColor + "22", color: mColor }}
          >{groupLabel}{tail}</span>
          {showCondition && (
            <span
              className="ac-equipment-card-status"
              style={{ background: eqColor + "22", color: eqColor }}
            >{eq.status}</span>
          )}
        </div>
        <div className="ac-maint-card-meta">
          {next ? (
            <>บำรุงครั้งต่อไป {formatDateLabel(next)}</>
          ) : m === "needs-date" ? (
            // Schedule defined (intervalDays > 0) but no anchor date —
            // tell the admin exactly what to fill in rather than the
            // ambiguous "no schedule" message.
            <>ตั้งรอบ {eq.intervalDays} วันแล้ว · ต้องระบุวันติดตั้ง/ซ่อมล่าสุด</>
          ) : (
            <>ยังไม่กำหนดรอบบำรุง</>
          )}
          {eq.lastService && <> · ซ่อมล่าสุด {formatDateLabel(eq.lastService)}</>}
        </div>
      </div>
      <div className="ac-maint-card-actions">
        <button
          className="ac-btn ac-btn-primary ac-btn-sm"
          onClick={() => onScheduleService(eq.building, eq.room, noteForTask)}
          title="สร้างงานทำสะอาด/บำรุงสำหรับอุปกรณ์นี้"
        >+ นัดบำรุง</button>
      </div>
    </li>
  );
}
