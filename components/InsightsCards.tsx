"use client";

import { useMemo } from "react";
import type { RoomView, SheetRow } from "@/types";
import { isDoneStatus, isCancelledStatus } from "@/lib/constants";
import { parseThaiDate } from "@/lib/dateUtils";
import { canViewFinancials } from "@/lib/permissions";
import { useEffectiveRoles } from "@/lib/useEffectiveRoles";

/**
 * Insights cards — Task 27 (light).
 *
 * 4 quick KPIs derived purely client-side from the rooms + tasks
 * already in memory. No new API; no Apps Script. Render on
 * Overview only (not Today / Tasks views) so the focused KPI
 * strip there doesn't compete with the at-a-glance Insights row.
 *
 * Metrics:
 *   - Occupancy %  → rooms with status "occupied" / total visible
 *   - Income/month → sum of occupied room prices (parsed; ฿)
 *   - Tasks this week → count of tasks created within 7 days
 *   - Done rate    → done / (done + cancelled + open) this month, %
 */

interface Props {
  rooms: RoomView[];
  tasks: SheetRow[];
  activeBuilding: string;
}

function parsePrice(s: string): number {
  // RoomRow.price is free-text from sheet ("3500", "3,500", "3,500 บาท")
  // Strip non-digits, parse, NaN → 0.
  const n = parseInt((s || "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function fmtBaht(n: number): string {
  if (n === 0) return "—";
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `฿${(n / 1_000).toFixed(0)}k`;
  return `฿${n.toLocaleString("th-TH")}`;
}

/** Trim activeBuilding scope onto the rooms list. */
function scopeRooms(rooms: RoomView[], activeBuilding: string): RoomView[] {
  if (activeBuilding === "ทั้งหมด") return rooms;
  return rooms.filter((r) => r.building === activeBuilding);
}

function scopeTasks(tasks: SheetRow[], activeBuilding: string): SheetRow[] {
  if (activeBuilding === "ทั้งหมด") return tasks;
  return tasks.filter((t) => t.building === activeBuilding);
}

export default function InsightsCards({ rooms, tasks, activeBuilding }: Props) {
  // Gate revenue card by finance permission. IMPORTANT: use the
  // effective roles (respects "view as" override) rather than the
  // raw session — management viewing-as-engineer must see the
  // engineer experience, including hiding the income card.
  const { actualRoles, effectiveRoles } = useEffectiveRoles();
  const roles = effectiveRoles.length ? effectiveRoles : actualRoles;
  const canSeeIncome = canViewFinancials(roles);
  const insights = useMemo(() => {
    const scopedRooms = scopeRooms(rooms, activeBuilding);
    const scopedTasks = scopeTasks(tasks, activeBuilding);

    const totalRooms = scopedRooms.length;
    const occupiedRooms = scopedRooms.filter((r) => r.status === "occupied");
    const occupancyPct = totalRooms === 0
      ? 0
      : Math.round((occupiedRooms.length / totalRooms) * 100);

    // Income = sum of prices of currently-occupied rooms (proxy for
    // monthly recurring revenue from rent — doesn't include extras)
    const income = occupiedRooms.reduce((s, r) => s + parsePrice(r.price), 0);

    // Tasks this week: created (or dated) within 7 days back
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(today.getTime() - 7 * 86400_000);
    const tasksThisWeek = scopedTasks.filter((t) => {
      const d = parseThaiDate(t.date);
      return d ? d.getTime() >= sevenDaysAgo.getTime() : false;
    });

    // Done rate (this month): done / (done + cancelled + open)
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthTasks = scopedTasks.filter((t) => {
      const d = parseThaiDate(t.date);
      return d ? d.getTime() >= firstOfMonth.getTime() : false;
    });
    const doneCount = thisMonthTasks.filter((t) => isDoneStatus(t.status)).length;
    const totalCount = thisMonthTasks.length;
    const doneRate = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

    return {
      occupancyPct,
      occupiedCount: occupiedRooms.length,
      totalRooms,
      income,
      tasksThisWeek: tasksThisWeek.length,
      doneRate,
      doneCount,
      totalThisMonth: totalCount,
    };
  }, [rooms, tasks, activeBuilding]);

  // Tone for occupancy: low → red, medium → orange, high → green
  const occToneClass =
    insights.occupancyPct >= 85 ? "is-good" :
    insights.occupancyPct >= 60 ? "is-mid"  :
    "is-low";
  const doneToneClass =
    insights.doneRate >= 80 ? "is-good" :
    insights.doneRate >= 50 ? "is-mid"  :
    "is-low";

  return (
    <section className="ac-insights" aria-label="Insights">
      <div className="ac-insights-grid">
        <article className={`ac-insights-card ${occToneClass}`}>
          <div className="ac-insights-label">Occupancy</div>
          <div className="ac-insights-value">{insights.occupancyPct}%</div>
          <div className="ac-insights-sub">
            {insights.occupiedCount}/{insights.totalRooms} ห้อง
          </div>
          <div className="ac-insights-bar">
            <div
              className="ac-insights-bar-fill"
              style={{ width: `${insights.occupancyPct}%` }}
              aria-hidden
            />
          </div>
        </article>

        {canSeeIncome && (
          <article className="ac-insights-card">
            <div className="ac-insights-label">รายได้คงค้าง/เดือน</div>
            <div className="ac-insights-value">{fmtBaht(insights.income)}</div>
            <div className="ac-insights-sub">
              จากห้องมีผู้เช่า · estimate
            </div>
          </article>
        )}

        <article className="ac-insights-card">
          <div className="ac-insights-label">งาน 7 วัน</div>
          <div className="ac-insights-value">{insights.tasksThisWeek}</div>
          <div className="ac-insights-sub">งานในช่วง 7 วันล่าสุด</div>
        </article>

        <article className={`ac-insights-card ${doneToneClass}`}>
          <div className="ac-insights-label">เสร็จเดือนนี้</div>
          <div className="ac-insights-value">{insights.doneRate}%</div>
          <div className="ac-insights-sub">
            {insights.doneCount}/{insights.totalThisMonth} งาน
          </div>
          <div className="ac-insights-bar">
            <div
              className="ac-insights-bar-fill"
              style={{ width: `${insights.doneRate}%` }}
              aria-hidden
            />
          </div>
        </article>
      </div>
    </section>
  );
}
