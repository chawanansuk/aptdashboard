"use client";

import { SheetRow, TASK_ORDER, TaskType } from "@/types";
import { parseThaiDate, isToday } from "@/lib/dateUtils";
import { formatSheetPhone, sheetPhoneDigits } from "@/lib/phoneFormat";
import EmptyState from "./EmptyState";

interface Props {
  rows: SheetRow[];
}

const BADGE_STYLE: Record<string, string> = {
  ทำสะอาด: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  ย้ายเข้า: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  ย้ายออก: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  ชมห้อง: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
};

function hasUrgentNote(note: string): boolean {
  return /เช็ค|ตรวจ/.test(note);
}


export default function TodayTasks({ rows }: Props) {
  const today = rows
    .filter((r) => {
      const d = parseThaiDate(r.date);
      return d && isToday(d);
    })
    .sort((a, b) => {
      const ai = TASK_ORDER.indexOf(a.type as TaskType);
      const bi = TASK_ORDER.indexOf(b.type as TaskType);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  return (
    <section>
      <h2 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-3">งานวันนี้</h2>

      {today.length === 0 ? (
        <EmptyState
          icon="celebration"
          tone="celebration"
          compact
          title="วันนี้ไม่มีงานค้าง 🎉"
          description="ใช้เวลาดูแลห้องอื่น หรือพักผ่อนได้เลย"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {today.map((row, i) => {
            const badge = BADGE_STYLE[row.type] ?? "bg-gray-100 text-gray-700";
            const urgent = row.note && hasUrgentNote(row.note);
            const rawPhone = sheetPhoneDigits(row.phone);

            return (
              <div
                key={i}
                className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex gap-3 items-start"
              >
                <span className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${badge}`}>
                  {row.type}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {row.building} {row.room}
                    </span>
                    {row.customer && (
                      <span className="text-sm text-gray-600 dark:text-gray-300">{row.customer}</span>
                    )}
                    {rawPhone && (
                      <a
                        href={`tel:${rawPhone}`}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {formatSheetPhone(row.phone)}
                      </a>
                    )}
                  </div>

                  {row.note && (
                    <p className={`mt-1 text-xs ${urgent ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
                      {row.note}
                    </p>
                  )}
                </div>

                {row.status && (
                  <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 ${
                    row.status === "เสร็จ"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                  }`}>
                    {row.status}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
