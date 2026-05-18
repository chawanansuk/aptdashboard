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

      <ul className="ac-maintenance-list">
        {filtered.map((eq) => {
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
          return (
            <li key={eq.id} className="ac-maint-card">
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
        })}
      </ul>
    </div>
  );
}
