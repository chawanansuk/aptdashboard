"use client";

import { useMemo } from "react";
import type { RoomView, SheetRow } from "@/types";
import { STATUS_DOT } from "@/lib/constants";
import { parseThaiDate } from "@/lib/dateUtils";
import { isDoneStatus, isCancelledStatus } from "@/lib/constants";

interface Props {
  rooms: RoomView[];
  tasks: SheetRow[];
  activeBuilding: string;
  onSelectRoom: (r: RoomView) => void;
  onQuickAddLead: () => void;
}

/**
 * Sales Pipeline — Sales role's home view. Replaces the bland tenants list
 * with the three things a sales person actually works with daily:
 *
 *   🏠 ห้องว่างพร้อมขาย      — supply
 *   📅 นัดหมายข้างหน้า        — pipeline (viewings + move-ins, future-dated)
 *   ⏰ สัญญาใกล้หมด          — churn risk + re-sell opportunity (next 30 days)
 *
 * Top KPI strip summarises the three counts so the user can scan in 1s.
 * Floating action button "บันทึกนัดชม" jumps straight to a pre-filled
 * AddTaskModal — handle a phone call without losing context.
 */

const SALES_TASK_TYPES = new Set(["ชมห้อง", "ย้ายเข้า"]);
const CONTRACT_SOON_DAYS = 30;

interface Appointment {
  task: SheetRow;
  date: Date;
}

export default function SalesPipelineView({
  rooms, tasks, activeBuilding, onSelectRoom, onQuickAddLead,
}: Props) {
  // Scope by active building once — every section uses the same scope.
  const scopedRooms = useMemo(
    () => activeBuilding === "ทั้งหมด"
      ? rooms
      : rooms.filter((r) => r.building === activeBuilding),
    [rooms, activeBuilding],
  );

  // Vacant ("ready") rooms — sort by building then room for stable display
  const vacantRooms = useMemo(
    () => scopedRooms
      .filter((r) => r.status === "ready")
      .sort((a, b) => a.building.localeCompare(b.building) || a.room.localeCompare(b.room)),
    [scopedRooms],
  );

  // Upcoming appointments: future-dated sales-side tasks, not done/cancelled.
  // We compare from start-of-today so today's open appointments still show.
  const upcomingAppointments = useMemo<Appointment[]>(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return (tasks || [])
      .filter((t) => {
        if (activeBuilding !== "ทั้งหมด" && t.building !== activeBuilding) return false;
        if (!SALES_TASK_TYPES.has(t.type)) return false;
        if (isDoneStatus(t.status) || isCancelledStatus(t.status)) return false;
        const d = parseThaiDate(t.date);
        if (!d) return false;
        if (d.getTime() < startOfToday.getTime()) return false;
        return true;
      })
      .map((t) => ({ task: t, date: parseThaiDate(t.date)! }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [tasks, activeBuilding]);

  // Contracts expiring within CONTRACT_SOON_DAYS — early warning for sales
  const expiringContracts = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    type Row = { room: RoomView; daysLeft: number };
    const out: Row[] = [];
    for (const r of scopedRooms) {
      if (r.status !== "occupied") continue;
      if (!r.contractEnd) continue;
      const d = parseThaiDate(r.contractEnd);
      if (!d) continue;
      const daysLeft = Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0 || daysLeft > CONTRACT_SOON_DAYS) continue;
      out.push({ room: r, daysLeft });
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [scopedRooms]);

  // KPI: count upcoming appointments in the next 7 days for the chip
  const appointmentsThisWeek = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    return upcomingAppointments.filter((a) => a.date.getTime() < cutoff.getTime()).length;
  }, [upcomingAppointments]);

  return (
    <section className="ac-sales-pipeline" aria-label="ภาพรวมขาย">
      {/* KPI strip */}
      <div className="ac-sales-kpi">
        <KpiCard label="ห้องว่าง" value={vacantRooms.length} accent="green" />
        <KpiCard label="นัดสัปดาห์นี้" value={appointmentsThisWeek} accent="sky" />
        <KpiCard label="สัญญาใกล้หมด (30 วัน)" value={expiringContracts.length} accent="orange" />
      </div>

      {/* Section 1 — ห้องว่างพร้อมขาย */}
      <div className="ac-sales-section">
        <div className="ac-sales-section-head">
          <h3 className="ac-sales-section-title">🏠 ห้องว่างพร้อมขาย</h3>
          <span className="ac-sales-section-count">{vacantRooms.length} ห้อง</span>
        </div>
        {vacantRooms.length === 0 ? (
          <div className="ac-sales-empty">ไม่มีห้องว่างในขณะนี้</div>
        ) : (
          <div className="ac-sales-list">
            {vacantRooms.map((r) => (
              <button
                key={`${r.building}|${r.room}`}
                className="ac-sales-row"
                onClick={() => onSelectRoom(r)}
              >
                <span className="ac-sales-row-dot" style={{ background: STATUS_DOT.ready }} aria-hidden />
                <span className="ac-sales-row-main">
                  <span className="ac-sales-row-title">ห้อง {r.room}</span>
                  <span className="ac-sales-row-sub">{r.building}{r.floor ? ` · ชั้น ${r.floor}` : ""}</span>
                </span>
                <span className="ac-sales-row-meta">
                  {formatBaht(r.price) ? `฿ ${formatBaht(r.price)}` : "—"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Section 2 — นัดหมายข้างหน้า */}
      <div className="ac-sales-section">
        <div className="ac-sales-section-head">
          <h3 className="ac-sales-section-title">📅 นัดหมายข้างหน้า</h3>
          <span className="ac-sales-section-count">{upcomingAppointments.length} นัด</span>
        </div>
        {upcomingAppointments.length === 0 ? (
          <div className="ac-sales-empty">ยังไม่มีนัดหมายข้างหน้า</div>
        ) : (
          <div className="ac-sales-list">
            {upcomingAppointments.map((a, idx) => (
              <div key={`${a.task.date}|${a.task.building}|${a.task.room}|${idx}`} className="ac-sales-row ac-sales-row-static">
                <span className={`ac-sales-tag ac-sales-tag-${a.task.type === "ชมห้อง" ? "view" : "movein"}`}>
                  {a.task.type}
                </span>
                <span className="ac-sales-row-main">
                  <span className="ac-sales-row-title">
                    {formatDateShort(a.date)} · ห้อง {a.task.room}
                  </span>
                  <span className="ac-sales-row-sub">
                    {a.task.building}
                    {a.task.customer ? ` · ${a.task.customer}` : ""}
                    {a.task.phone ? ` · ${a.task.phone}` : ""}
                  </span>
                </span>
                <span className="ac-sales-row-meta">{relativeDays(a.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3 — สัญญาใกล้หมด */}
      <div className="ac-sales-section">
        <div className="ac-sales-section-head">
          <h3 className="ac-sales-section-title">⏰ สัญญาใกล้หมด</h3>
          <span className="ac-sales-section-count">{expiringContracts.length} ห้อง</span>
        </div>
        {expiringContracts.length === 0 ? (
          <div className="ac-sales-empty">ไม่มีสัญญาที่ใกล้หมดใน 30 วัน</div>
        ) : (
          <div className="ac-sales-list">
            {expiringContracts.map(({ room, daysLeft }) => (
              <button
                key={`${room.building}|${room.room}`}
                className="ac-sales-row"
                onClick={() => onSelectRoom(room)}
              >
                <span className="ac-sales-row-dot" style={{ background: STATUS_DOT.occupied }} aria-hidden />
                <span className="ac-sales-row-main">
                  <span className="ac-sales-row-title">ห้อง {room.room}</span>
                  <span className="ac-sales-row-sub">
                    {room.building}
                    {room.tenant ? ` · ${room.tenant}` : ""}
                    {room.phone ? ` · ${room.phone}` : ""}
                  </span>
                </span>
                <span className={`ac-sales-row-meta ${daysLeft <= 7 ? "is-urgent" : ""}`}>
                  เหลือ {daysLeft} วัน
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating action — quick add lead (viewing appointment) */}
      <button
        className="ac-sales-fab"
        onClick={onQuickAddLead}
        title="บันทึกนัดชมห้องใหม่"
        aria-label="บันทึกนัดชมห้องใหม่"
      >
        <span aria-hidden>+</span>
        <span className="ac-sales-fab-text">บันทึกนัดชม</span>
      </button>
    </section>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent: "green" | "sky" | "orange" }) {
  return (
    <div className={`ac-sales-kpi-card ac-sales-kpi-${accent}`}>
      <div className="ac-sales-kpi-value">{value}</div>
      <div className="ac-sales-kpi-label">{label}</div>
    </div>
  );
}

/* ====================================================================
 * Pure helpers — top-level so they're testable
 * ==================================================================== */

export function formatBaht(s: string | undefined | null): string {
  if (!s) return "";
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("th-TH");
}

export function formatDateShort(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export function relativeDays(d: Date, now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "วันนี้";
  if (diff === 1) return "พรุ่งนี้";
  if (diff > 1 && diff <= 7) return `ใน ${diff} วัน`;
  if (diff > 7) return `ใน ${diff} วัน`;
  return "";
}
