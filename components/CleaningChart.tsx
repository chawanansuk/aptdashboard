"use client";

import { SheetRow, BuildingLoad, BUILDINGS } from "@/types";
import { parseThaiDate, isThisWeek } from "@/lib/dateUtils";

interface Props {
  rows: SheetRow[];
}

export default function CleaningChart({ rows }: Props) {
  const loads: BuildingLoad[] = BUILDINGS.map((building) => ({
    building,
    count: rows.filter((r) => {
      const d = parseThaiDate(r.date);
      return d && r.type === "ทำสะอาด" && isThisWeek(d) && r.building === building;
    }).length,
  })).sort((a, b) => b.count - a.count);

  const max = Math.max(...loads.map((l) => l.count), 1);

  if (loads.every((l) => l.count === 0)) {
    return (
      <section>
        <h2 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-3">
          ภาระทำสะอาดสัปดาห์นี้
        </h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">ยังไม่มีข้อมูล</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-3">
        ภาระทำสะอาดสัปดาห์นี้
      </h2>
      <div className="flex flex-col gap-2">
        {loads.map((item) => {
          const pct = max > 0 ? (item.count / max) * 100 : 0;
          return (
            <div key={item.building} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-sm text-gray-600 dark:text-gray-300 text-right">
                {item.building}
              </span>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 dark:bg-amber-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-sm font-medium text-gray-700 dark:text-gray-200 text-right">
                {item.count}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
