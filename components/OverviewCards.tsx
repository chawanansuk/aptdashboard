"use client";

import { useMemo } from "react";
import type { Role } from "@/auth";
import type { RoomView, SheetRow } from "@/types";
import { canAccess, canPerform } from "@/lib/permissions";
import { useOverviewStats } from "@/lib/useOverviewStats";

type ViewTarget =
  | "overview" | "today" | "ready" | "tenants"
  | "maintenance" | "income";

interface Props {
  rooms: RoomView[];
  tasks: SheetRow[];
  activeBuilding: string;
  roles: Role[];
  onNavigate: (view: ViewTarget) => void;
}

function fmtBaht(n: number): string {
  return n.toLocaleString("th-TH") + " ฿";
}

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
  onClick?: () => void;
  loading?: boolean;
}

/**
 * Occupancy card — replaces the previous "อัตราเช่า" StatCard plus the
 * duplicate "Occupancy" card on InsightsCards (which counted strictly
 * status="occupied" and showed e.g. 78% next to this card's 81% on the
 * same page — staff reported it as confusing). Single source of truth:
 * the headline rate keeps its existing semantic ((occupied+moveout)/total)
 * and the stacked bar visually explains where the other rooms went.
 */
interface OccupancyCardProps {
  rate: number;
  total: number;
  vacant: number;
  breakdown: {
    occupied: number; available: number; pending: number;
    moveout: number;  maintenance: number;
  };
  onClick?: () => void;
}

const OCC_SEG_ORDER = ["occupied", "available", "pending", "moveout", "maintenance"] as const;
const OCC_SEG_LABEL: Record<typeof OCC_SEG_ORDER[number], string> = {
  occupied: "มีผู้เช่า",
  available: "พร้อมขาย",
  pending: "รอสัญญา",
  moveout: "แจ้งย้ายออก",
  maintenance: "ไม่พร้อม",
};

function OccupancyCard({ rate, total, vacant, breakdown, onClick }: OccupancyCardProps) {
  const tone: CardProps["tone"] = rate >= 0.85 ? "good" : rate >= 0.7 ? "info" : "warn";
  const pct = Math.round(rate * 100);
  return (
    <button
      type="button"
      className={`ac-overview-card ac-overview-card-${tone} ac-occ-card ${onClick ? "is-clickable" : ""}`}
      onClick={onClick}
      disabled={!onClick}
      aria-label={`อัตราเช่า ${pct}% · ${vacant} ห้องว่าง จาก ${total} ห้อง`}
    >
      <div className="ac-overview-card-label">อัตราเช่า</div>
      <div className="ac-overview-card-value">{pct}%</div>
      <div className="ac-overview-card-sub">{vacant} ห้องว่าง · {total} ห้องทั้งหมด</div>
      <div className="ac-occ-bar" role="img" aria-label="สัดส่วนสถานะห้อง">
        {OCC_SEG_ORDER.map((k) => {
          const n = breakdown[k];
          if (n === 0 || total === 0) return null;
          const width = (n / total) * 100;
          return (
            <span
              key={k}
              className={`ac-occ-bar-seg ac-occ-bar-${k}`}
              style={{ width: `${width}%` }}
              title={`${OCC_SEG_LABEL[k]}: ${n} ห้อง (${Math.round(width)}%)`}
              aria-label={`${OCC_SEG_LABEL[k]} ${n} ห้อง`}
            />
          );
        })}
      </div>
      <ul className="ac-occ-legend">
        {OCC_SEG_ORDER.map((k) => (
          <li key={k} className="ac-occ-legend-item">
            <span className={`ac-occ-legend-dot ac-occ-bar-${k}`} aria-hidden />
            <span className="ac-occ-legend-label">{OCC_SEG_LABEL[k]}</span>
            <span className="ac-occ-legend-num">{breakdown[k]}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

function StatCard({ label, value, sub, tone = "neutral", onClick, loading }: CardProps) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      className={`ac-overview-card ac-overview-card-${tone} ${clickable ? "is-clickable" : ""}`}
      onClick={onClick}
      disabled={!clickable}
      aria-label={label}
    >
      <div className="ac-overview-card-label">{label}</div>
      <div className="ac-overview-card-value">
        {loading ? <span className="ac-overview-card-skeleton" /> : value}
      </div>
      {sub && <div className="ac-overview-card-sub">{sub}</div>}
    </button>
  );
}

export default function OverviewCards({
  rooms, tasks, activeBuilding, roles, onNavigate,
}: Props) {
  // Scope rooms/tasks by activeBuilding (header chip controls this)
  const scopedRooms = useMemo(
    () => activeBuilding === "ทั้งหมด" ? rooms : rooms.filter((r) => r.building === activeBuilding),
    [rooms, activeBuilding]
  );
  const scopedTasks = useMemo(
    () => activeBuilding === "ทั้งหมด" ? tasks : tasks.filter((t) => t.building === activeBuilding),
    [tasks, activeBuilding]
  );

  const canSeeMaintenance = canAccess(roles, "maintenance");
  const canSeeIncome = canPerform(roles, "finance.view");

  const stats = useOverviewStats(scopedRooms, scopedTasks, { canSeeMaintenance });

  const { occupancy, todayTaskCount, expiringThisMonth, monthlyIncome, maintenance } = stats;

  // Don't render cards if there's literally no data yet (first paint)
  if (rooms.length === 0) return null;

  return (
    <section className="ac-overview-cards" aria-label="สรุปภาพรวม">
      <OccupancyCard
        rate={occupancy.rate}
        total={occupancy.total}
        vacant={occupancy.vacant}
        breakdown={occupancy.breakdown}
        onClick={() => onNavigate("ready")}
      />
      <StatCard
        label="งานวันนี้"
        value={String(todayTaskCount)}
        sub={todayTaskCount === 0 ? "ไม่มีงานค้าง" : "รายการที่ยังไม่ปิด"}
        tone={todayTaskCount === 0 ? "good" : todayTaskCount > 5 ? "warn" : "info"}
        onClick={() => onNavigate("today")}
      />
      {canAccess(roles, "tenants") && (
        <StatCard
          label="สัญญาหมดเดือนนี้"
          value={String(expiringThisMonth)}
          sub={expiringThisMonth === 0 ? "ยังไม่มี" : "ห้องที่ต้องต่อสัญญา"}
          tone={expiringThisMonth === 0 ? "good" : expiringThisMonth >= 5 ? "warn" : "info"}
          onClick={() => onNavigate("tenants")}
        />
      )}
      {canSeeMaintenance && (
        <StatCard
          label="เลยกำหนดบำรุง"
          value={maintenance.loading ? "" : String(maintenance.overdue)}
          sub={
            maintenance.loading ? "กำลังโหลด..." :
            maintenance.error ? maintenance.error :
            maintenance.dueSoon > 0 ? `+ ใกล้ครบรอบ ${maintenance.dueSoon} ชิ้น` :
            "ทุกอย่างตามรอบ"
          }
          tone={
            maintenance.loading ? "neutral" :
            maintenance.overdue > 0 ? "danger" :
            maintenance.dueSoon > 0 ? "warn" :
            "good"
          }
          onClick={() => onNavigate("maintenance")}
          loading={maintenance.loading}
        />
      )}
      {canSeeIncome && (
        <StatCard
          label="รายได้เดือนนี้"
          value={fmtBaht(monthlyIncome)}
          sub={`จาก ${occupancy.occupied} ห้องที่มีผู้เช่า`}
          tone="info"
          onClick={() => onNavigate("income")}
        />
      )}
    </section>
  );
}
