"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RoomEquipment, MaintenanceStatus } from "@/types";
import {
  EQUIPMENT_TYPES, EQUIPMENT_TYPE_ICON, EQUIPMENT_STATUS_COLOR,
  MAINTENANCE_STATUS_COLOR, MAINTENANCE_STATUS_LABEL,
} from "@/lib/constants";
import {
  computeNextService, getMaintenanceStatus, daysUntilService, formatDateLabel,
} from "@/lib/maintenanceUtils";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";

interface Props {
  activeBuilding: string;
  onScheduleService: (building: string, room: string, note: string) => void;
}

type StatusFilter = "all" | MaintenanceStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "overdue", label: "เลยกำหนด" },
  { key: "due-soon", label: "ใกล้ครบรอบ" },
  { key: "ok", label: "ตามรอบ" },
];

const STATUS_ORDER: Record<MaintenanceStatus, number> = {
  overdue: 0,
  "due-soon": 1,
  ok: 2,
  unknown: 3,
};

export default function MaintenanceView({ activeBuilding, onScheduleService }: Props) {
  const [rows, setRows] = useState<RoomEquipment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/maintenance-plan", { cache: "no-store" });
      const j = await res.json().catch(() => ({ error: "invalid JSON" }));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const list: RoomEquipment[] = Array.isArray(j.rows) ? j.rows : [];
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Filtered + sorted equipment list (respects activeBuilding + filters). */
  const filtered = useMemo(() => {
    if (!rows) return [];
    const list = rows.filter((eq) => {
      if (activeBuilding !== "ทั้งหมด" && eq.building !== activeBuilding) return false;
      if (typeFilter !== "all" && eq.type !== typeFilter) return false;
      const m = getMaintenanceStatus(eq);
      if (statusFilter !== "all" && m !== statusFilter) return false;
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
   *  (so user always sees the bigger picture even after filtering). */
  const counts = useMemo(() => {
    if (!rows) return { overdue: 0, dueSoon: 0, ok: 0, unknown: 0 };
    let overdue = 0, dueSoon = 0, ok = 0, unknown = 0;
    for (const eq of rows) {
      if (activeBuilding !== "ทั้งหมด" && eq.building !== activeBuilding) continue;
      const m = getMaintenanceStatus(eq);
      if (m === "overdue") overdue++;
      else if (m === "due-soon") dueSoon++;
      else if (m === "ok") ok++;
      else unknown++;
    }
    return { overdue, dueSoon, ok, unknown };
  }, [rows, activeBuilding]);

  /** Week preview — items due in next 7 days or already overdue.
   *  Uses the FILTERED set so user can scope the week by status/type
   *  if they've narrowed the view. */
  const weekItems = useMemo(() => {
    const list: Array<{ eq: RoomEquipment; days: number | null; status: MaintenanceStatus }> = [];
    for (const eq of filtered) {
      const days = daysUntilService(eq);
      const status = getMaintenanceStatus(eq);
      // overdue (days < 0) OR due in ≤ 7 days
      if (days !== null && days <= 7) {
        list.push({ eq, days, status });
      }
    }
    // Most-overdue first, then nearest future
    return list.sort((a, b) => (a.days ?? 0) - (b.days ?? 0)).slice(0, 8);
  }, [filtered]);

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

  return (
    <div className="ac-maintenance">
      <div className="ac-maintenance-summary">
        <div className="ac-maint-stat" style={{ borderColor: MAINTENANCE_STATUS_COLOR.overdue }}>
          <div className="ac-maint-stat-num" style={{ color: MAINTENANCE_STATUS_COLOR.overdue }}>{counts.overdue}</div>
          <div className="ac-maint-stat-label">เลยกำหนด</div>
        </div>
        <div className="ac-maint-stat" style={{ borderColor: MAINTENANCE_STATUS_COLOR["due-soon"] }}>
          <div className="ac-maint-stat-num" style={{ color: MAINTENANCE_STATUS_COLOR["due-soon"] }}>{counts.dueSoon}</div>
          <div className="ac-maint-stat-label">ใกล้ครบรอบ (≤14 วัน)</div>
        </div>
        <div className="ac-maint-stat" style={{ borderColor: MAINTENANCE_STATUS_COLOR.ok }}>
          <div className="ac-maint-stat-num" style={{ color: MAINTENANCE_STATUS_COLOR.ok }}>{counts.ok}</div>
          <div className="ac-maint-stat-label">ตามรอบ</div>
        </div>
        <div className="ac-maint-stat" style={{ borderColor: MAINTENANCE_STATUS_COLOR.unknown }}>
          <div className="ac-maint-stat-num" style={{ color: MAINTENANCE_STATUS_COLOR.unknown }}>{counts.unknown}</div>
          <div className="ac-maint-stat-label">ไม่กำหนดรอบ</div>
        </div>
      </div>

      {/* Week preview — top of page; "what's pressing this week" */}
      {weekItems.length > 0 && (
        <section className="ac-maint-week" aria-label="บำรุงรักษา 7 วันถัดไป">
          <div className="ac-maint-week-head">
            <span className="ac-maint-week-title">บำรุงรักษา 7 วันถัดไป</span>
            <span className="ac-maint-week-sub">{weekItems.length} รายการ (รวมที่เลยกำหนด)</span>
          </div>
          <ul className="ac-maint-week-list">
            {weekItems.map(({ eq, days, status }) => {
              const dueClass =
                status === "overdue" ? "is-overdue" :
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
        {STATUS_FILTERS.map((f) => (
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
        {EQUIPMENT_TYPES.map((t) => (
          <button
            key={t}
            className={`ac-chip ${typeFilter === t ? "is-active" : ""}`}
            onClick={() => setTypeFilter(t)}
          >{EQUIPMENT_TYPE_ICON[t] || ""} {t}</button>
        ))}
      </div>

      {err && <div className="ac-banner ac-banner-warn">{err}</div>}

      {loading && !rows && (
        <LoadingState label="กำลังโหลดแผนบำรุง..." />
      )}

      {!loading && rows && filtered.length === 0 && (
        <EmptyState
          icon="search"
          title="ไม่มีอุปกรณ์ตามตัวกรองนี้"
          description="ลองเลือกตัวกรองสถานะหรือประเภทอื่น เพื่อดูรายการอุปกรณ์ทั้งหมด"
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
  const next = computeNextService(eq);
  const days = daysUntilService(eq);
  const mColor = MAINTENANCE_STATUS_COLOR[m] || "#94A3B8";
  const eqColor = EQUIPMENT_STATUS_COLOR[eq.status] || "#94A3B8";
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
          >{MAINTENANCE_STATUS_LABEL[m]}{tail}</span>
          <span
            className="ac-equipment-card-status"
            style={{ background: eqColor + "22", color: eqColor }}
          >{eq.status}</span>
        </div>
        <div className="ac-maint-card-meta">
          {next ? <>บำรุงครั้งต่อไป {formatDateLabel(next)}</> : <>ยังไม่กำหนดรอบบำรุง</>}
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
