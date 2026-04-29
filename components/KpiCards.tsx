"use client";

import { SheetRow } from "@/types";
import { parseThaiDate, isToday, isThisWeek, isThisMonth } from "@/lib/dateUtils";

interface Props {
  rows: SheetRow[];
}

interface CardProps {
  label: string;
  value: number;
  unit: string;
  color: string;
}

function KpiCard({ label, value, unit, color }: CardProps) {
  return (
    <div className={`rounded-xl p-4 flex flex-col gap-1 ${color}`}>
      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-medium text-gray-900 dark:text-gray-50">{value}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">{unit}</span>
      </div>
    </div>
  );
}

export default function KpiCards({ rows }: Props) {
  const todayCount = rows.filter((r) => {
    const d = parseThaiDate(r.date);
    return d && isToday(d);
  }).length;

  const cleanWeekCount = rows.filter((r) => {
    const d = parseThaiDate(r.date);
    return d && r.type === "ทำสะอาด" && isThisWeek(d);
  }).length;

  const moveInMonthCount = rows.filter((r) => {
    const d = parseThaiDate(r.date);
    return d && r.type === "ย้ายเข้า" && isThisMonth(d);
  }).length;

  return (
    <div className="grid grid-cols-3 gap-3">
      <KpiCard
        label="งานวันนี้"
        value={todayCount}
        unit="รายการ"
        color="bg-gray-50 dark:bg-gray-800"
      />
      <KpiCard
        label="ทำสะอาดสัปดาห์นี้"
        value={cleanWeekCount}
        unit="ห้อง"
        color="bg-amber-50 dark:bg-amber-900/30"
      />
      <KpiCard
        label="ย้ายเข้าเดือนนี้"
        value={moveInMonthCount}
        unit="ห้อง"
        color="bg-green-50 dark:bg-green-900/30"
      />
    </div>
  );
}
