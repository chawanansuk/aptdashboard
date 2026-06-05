"use client";

import { memo } from "react";
import { Icon, type IconName } from "@/lib/icons";
import { SALES_STATUS_META, type StatusMeta } from "@/lib/salesTheme";
import type { SalesKpis } from "@/lib/salesData";
import styles from "./sales.module.css";

interface Props {
  kpis: SalesKpis;
  /** Navigate to a sidebar status view when a card is clicked. */
  onAvailable?: () => void;
  onPending?: () => void;
  onMoveout?: () => void;
  /** Scroll the appointments rail into view. */
  onAppointments?: () => void;
}

interface CardSpec {
  key: string;
  icon: IconName;
  value: number;
  label: string;
  meta: StatusMeta;
  onClick?: () => void;
  trend?: string;
}

/** Blue accent for the appointments card (an event metric, not a room
 *  status) — defined here rather than salesTheme since it's KPI-local. */
const APPT_META: StatusMeta = {
  label: "นัดหมาย",
  base: "#60A5FA",
  tint: "rgba(96,165,250,.12)",
  border: "rgba(96,165,250,.30)",
};

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
        {spec.trend && <span className={styles.kpiTrend}>{spec.trend}</span>}
      </div>
      <div className={`${styles.kpiValue} ${styles.mono}`}>{spec.value}</div>
      <div className={styles.kpiLabel}>{spec.label}</div>
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

function KpiRow({ kpis, onAvailable, onPending, onMoveout, onAppointments }: Props) {
  const cards: CardSpec[] = [
    {
      key: "available",
      icon: "home",
      value: kpis.available,
      label: "ห้องว่างพร้อมขาย",
      meta: SALES_STATUS_META.available,
      onClick: onAvailable,
    },
    {
      key: "appointments",
      icon: "calendarClock",
      value: kpis.appointmentsThisWeek,
      label: "นัดหมายสัปดาห์นี้",
      meta: APPT_META,
      onClick: onAppointments,
    },
    {
      key: "pending",
      icon: "key",
      value: kpis.pending,
      label: "รอย้ายเข้า / เซ็นสัญญา",
      meta: SALES_STATUS_META.pending,
      onClick: onPending,
    },
    {
      key: "moveout",
      icon: "doorOpen",
      value: kpis.moveout,
      label: "แจ้งย้ายออก",
      meta: SALES_STATUS_META.moveout,
      onClick: onMoveout,
    },
  ];

  return (
    <div className={styles.kpiRow}>
      {cards.map((c) => <KpiCard key={c.key} spec={c} />)}
    </div>
  );
}

export default memo(KpiRow);
