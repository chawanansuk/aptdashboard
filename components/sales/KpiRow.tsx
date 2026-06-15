"use client";

import { memo } from "react";
import { Icon, type IconName } from "@/lib/icons";
import { SALES_STATUS_META, type StatusMeta } from "@/lib/salesTheme";
import type { SalesKpis } from "@/lib/salesData";
import Sparkline from "./Sparkline";
import styles from "./sales.module.css";

type KpiKey = "available" | "appointments" | "pending" | "moveout";

interface Props {
  kpis: SalesKpis;
  /**
   * Real per-card trend series (oldest → newest, ~7 points). Any card
   * whose key is omitted falls back to a deterministic placeholder
   * derived from its current value.
   *
   * Currently only `appointments` has a real series — derived from the
   * tasks sheet (events with dates already in the data). The three
   * room-status cards need daily snapshots that aren't recorded yet;
   * a backend endpoint that persists daily KPI counts will unblock
   * them — until then they show the placeholder. Search for
   * "TODO: snapshot endpoint" to find the wire point.
   */
  trends?: Partial<Record<KpiKey, number[]>>;
  /** Navigate to a sidebar status view when a card is clicked. */
  onAvailable?: () => void;
  onPending?: () => void;
  onMoveout?: () => void;
  /** Scroll the appointments rail into view. */
  onAppointments?: () => void;
}

interface CardSpec {
  key: KpiKey;
  icon: IconName;
  value: number;
  label: string;
  meta: StatusMeta;
  trend: number[];
  badge: string;
  onClick?: () => void;
}

/** Blue accent for the appointments card (an event metric, not a room
 *  status) — defined here rather than salesTheme since it's KPI-local. */
const APPT_META: StatusMeta = {
  label: "นัดหมาย",
  base: "#60A5FA",
  tint: "rgba(96,165,250,.12)",
  border: "rgba(96,165,250,.30)",
};

/**
 * Deterministic placeholder trend ending at `current`. A gentle wave so
 * the line looks like a trend without implying real data. Same input →
 * same output, so it won't jitter between renders.
 *
 * Used for the three room-status cards (available/pending/moveout).
 * TODO: snapshot endpoint — once a backend stores a daily count for
 * each status, feed it through the `trends` prop and this placeholder
 * becomes dead code.
 */
function placeholderTrend(current: number): number[] {
  const base = Math.max(current, 1);
  const wave = [0.62, 0.78, 0.7, 0.85, 0.74, 0.92, 1]; // ratios, ends at 1
  return wave.map((r) => Math.max(0, Math.round(base * r)));
}

function KpiRow({ kpis, trends, onAvailable, onPending, onMoveout, onAppointments }: Props) {
  const trendFor = (k: KpiKey, value: number): number[] =>
    trends?.[k] ?? placeholderTrend(value);

  const cards: CardSpec[] = [
    {
      key: "available",
      icon: "home",
      value: kpis.available,
      label: "ห้องว่างพร้อมขาย",
      meta: SALES_STATUS_META.available,
      trend: trendFor("available", kpis.available),
      badge: kpis.available > 0 ? `พร้อมขาย ${kpis.available}` : "เต็มทุกห้อง",
      onClick: onAvailable,
    },
    {
      key: "appointments",
      icon: "calendarClock",
      value: kpis.appointmentsThisWeek,
      label: "นัดหมายสัปดาห์นี้",
      meta: APPT_META,
      trend: trendFor("appointments", kpis.appointmentsThisWeek),
      badge: kpis.appointmentsThisWeek > 0 ? `สัปดาห์นี้ ${kpis.appointmentsThisWeek}` : "ยังไม่มีนัด",
      onClick: onAppointments,
    },
    {
      key: "pending",
      icon: "key",
      value: kpis.pending,
      label: "รอย้ายเข้า / เซ็นสัญญา",
      meta: SALES_STATUS_META.pending,
      trend: trendFor("pending", kpis.pending),
      badge: kpis.pending > 0 ? `เตรียมห้อง ${kpis.pending}` : "ไม่มีคิว",
      onClick: onPending,
    },
    {
      key: "moveout",
      icon: "doorOpen",
      value: kpis.moveout,
      label: "แจ้งย้ายออก",
      meta: SALES_STATUS_META.moveout,
      trend: trendFor("moveout", kpis.moveout),
      badge: kpis.moveout > 0 ? `ด่วน ${kpis.moveout}` : "ไม่มี",
      onClick: onMoveout,
    },
  ];

  return (
    <div className={styles.kpiRow}>
      {cards.map((c) => <KpiCard key={c.key} spec={c} />)}
    </div>
  );
}

function KpiCard({ spec }: { spec: CardSpec }) {
  const styleVars = {
    "--st-base": spec.meta.base,
    "--st-tint": spec.meta.tint,
    "--st-border": spec.meta.border,
  } as React.CSSProperties;

  const inner = (
    <>
      <div className={styles.kpiTop}>
        <span className={styles.kpiIcon}><Icon name={spec.icon} size={20} /></span>
        <Sparkline data={spec.trend} color={spec.meta.base} className={styles.kpiSpark} />
      </div>
      <div className={`${styles.kpiValue} ${styles.mono}`}>{spec.value}</div>
      <div className={styles.kpiBottom}>
        <span className={styles.kpiLabel}>{spec.label}</span>
        <span className={styles.kpiBadge}>{spec.badge}</span>
      </div>
    </>
  );

  if (spec.onClick) {
    return (
      <button
        type="button"
        className={`${styles.kpiCard} ${styles.clickable}`}
        style={styleVars}
        onClick={spec.onClick}
        aria-label={`${spec.label} ${spec.value}`}
      >
        {inner}
      </button>
    );
  }
  return <div className={styles.kpiCard} style={styleVars}>{inner}</div>;
}

export default memo(KpiRow);
