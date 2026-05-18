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

function fmtPct(n: number): string {
  return Math.round(n * 100) + "%";
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
      <StatCard
        label="อัตราเช่า"
        value={fmtPct(occupancy.rate)}
        sub={`${occupancy.vacant} ห้องว่าง · ${occupancy.total} ห้องทั้งหมด`}
        tone={occupancy.rate >= 0.85 ? "good" : occupancy.rate >= 0.7 ? "info" : "warn"}
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
