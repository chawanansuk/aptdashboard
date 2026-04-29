"use client";

import { SheetRow } from "@/types";
import { parseThaiDate, isThisWeek, getThisWeekDays, formatThaiDate } from "@/lib/dateUtils";
import { isSameDay } from "date-fns";

interface Props {
  rows: SheetRow[];
}

const MAX_PER_DAY = 2;

export default function CapacityWarning({ rows }: Props) {
  const weekDays = getThisWeekDays();

  const warnings: { building: string; date: Date; count: number }[] = [];

  const cleanRows = rows.filter((r) => {
    const d = parseThaiDate(r.date);
    return d && r.type === "ทำสะอาด" && isThisWeek(d);
  });

  // จัดกลุ่มตาม building × วัน
  const buildings = [...new Set(cleanRows.map((r) => r.building))];

  for (const building of buildings) {
    for (const day of weekDays) {
      const count = cleanRows.filter((r) => {
        const d = parseThaiDate(r.date);
        return r.building === building && d && isSameDay(d, day);
      }).length;

      if (count > MAX_PER_DAY) {
        warnings.push({ building, date: day, count });
      }
    }
  }

  if (warnings.length === 0) return null;

  return (
    <section>
      <div className="flex flex-col gap-2">
        {warnings.map((w, i) => {
          const over = w.count - MAX_PER_DAY;
          return (
            <div
              key={i}
              className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 p-3"
            >
              <div className="flex items-start gap-2">
                <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    เกินกำลัง: ตึก {w.building} {formatThaiDate(w.date)} มีทำสะอาด {w.count} ห้อง (เกิน {MAX_PER_DAY}/วัน)
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    ขยับ {over} ห้องไปวันก่อนหน้าหรือถัดไป
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
