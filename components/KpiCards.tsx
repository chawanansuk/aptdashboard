"use client";

import { useState } from "react";
import { SheetRow } from "@/types";
import { parseThaiDate, isToday, isThisWeek, isThisMonth } from "@/lib/dateUtils";

interface Props {
    rows: SheetRow[];
}

type ModalType = "today" | "cleanWeek" | "moveInMonth" | null;

function Modal({ title, items, onClose }: { title: string; items: SheetRow[]; onClose: () => void }) {
    return (
          <div
                  className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
                  onClick={onClose}
                >
                <div className="absolute inset-0 bg-black/40" />
                <div
                          className="relative z-10 w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[80vh] flex flex-col"
                          onClick={(e) => e.stopPropagation()}
                        >
                  {/* Header */}
                        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">{title}</h2>h2>
                                  <button
                                                onClick={onClose}
                                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
                                              >
                                              ✕
                                  </button>
                        </div>
                  {/* List */}
                        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-2">
                          {items.length === 0 ? (
                                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">ไม่มีรายการ</p>p>
                                    ) : (
                                      items.map((r, i) => (
                                                      <div
                                                                        key={i}
                                                                        className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 flex items-start gap-3"
                                                                      >
                                                                      <span
                                                                                          className={`mt-0.5 shrink-0 text-xs font-medium rounded-full px-2 py-0.5 ${
                                                                                                                r.type === "ทำสะอาด"
                                                                                                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                                                                                                  : r.type === "ย้ายเข้า"
                                                                                                                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                                                                                                  : r.type === "ย้ายออก"
                                                                                                                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                                                                                                  : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                                                                                            }`}
                                                                                        >
                                                                        {r.type}
                                                                      </span>span>
                                                                      <div className="flex-1 min-w-0">
                                                                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                                                          {r.building} {r.room}
                                                                                          {r.customer ? ` · ${r.customer}` : ""}
                                                                                          </p>p>
                                                                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                                                                          {r.date}
                                                                                          {r.note ? ` · ${r.note}` : ""}
                                                                                          </p>p>
                                                                        {r.phone && (
                                                                                            <a
                                                                                                                    href={`tel:${r.phone.replace(/-/g, "")}`}
                                                                                                                    className="text-xs text-blue-500 dark:text-blue-400 mt-0.5 inline-block"
                                                                                                                  >
                                                                                              {r.phone}
                                                                                              </a>a>
                                                                                        )}
                                                                      </div>div>
                                                                      <span
                                                                                          className={`shrink-0 text-xs rounded-full px-2 py-0.5 ${
                                                                                                                r.status === "เสร็จ" || r.status === "เสร็็จ"
                                                                                                                  ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                                                                                                                  : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                                                                                            }`}
                                                                                        >
                                                                        {r.status === "เสร็็จ" ? "เสร็จ" : r.status}
                                                                      </span>span>
                                                      </div>div>
                                                    ))
                                    )}
                        </div>div>
                  {/* Footer count */}
                        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800">
                                  <p className="text-xs text-gray-400 dark:text-gray-500 text-right">{items.length} รายการ</p>p>
                        </div>div>
                </div>div>
          </div>div>
        );
}

export default function KpiCards({ rows }: Props) {
    const [modal, setModal] = useState<ModalType>(null);
  
    const todayRows = rows.filter((r) => {
          const d = parseThaiDate(r.date);
          return d && isToday(d);
    });
  
    const cleanWeekRows = rows.filter((r) => {
          const d = parseThaiDate(r.date);
          return d && r.type === "ทำสะอาด" && isThisWeek(d);
    });
  
    const moveInMonthRows = rows.filter((r) => {
          const d = parseThaiDate(r.date);
          return d && r.type === "ย้ายเข้า" && isThisMonth(d);
    });
  
    const getModalData = (): { title: string; items: SheetRow[] } => {
          if (modal === "today") return { title: "งานวันนี้", items: todayRows };
          if (modal === "cleanWeek") return { title: "ทำสะอาดสัปดาห์นี้", items: cleanWeekRows };
          if (modal === "moveInMonth") return { title: "ห้องเข้าเดือนนี้", items: moveInMonthRows };
          return { title: "", items: [] };
    };
  
    const cards = [
      {
              key: "today" as ModalType,
              label: "งานวันนี้",
              value: todayRows.length,
              unit: "รายการ",
              color: "bg-gray-50 dark:bg-gray-800/60",
      },
      {
              key: "cleanWeek" as ModalType,
              label: "ทำสะอาดสัปดาห์นี้",
              value: cleanWeekRows.length,
              unit: "ห้อง",
              color: "bg-blue-50 dark:bg-blue-900/20",
      },
      {
              key: "moveInMonth" as ModalType,
              label: "ห้องเข้าเดือนนี้",
              value: moveInMonthRows.length,
              unit: "ห้อง",
              color: "bg-green-50 dark:bg-green-900/20",
      },
        ];
  
    const { title, items } = getModalData();
  
    return (
          <>
                <div className="grid grid-cols-3 gap-3">
                  {cards.map((c) => (
                      <button
                                    key={c.key}
                                    onClick={() => setModal(c.key)}
                                    className={`${c.color} rounded-xl p-4 flex flex-col gap-1 text-left hover:opacity-80 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400`}
                                  >
                                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-tight">{c.label}</span>span>
                                  <div className="flex items-baseline gap-1">
                                                <span className="text-3xl font-medium text-gray-900 dark:text-gray-50">{c.value}</span>span>
                                                <span className="text-sm text-gray-500 dark:text-gray-400">{c.unit}</span>span>
                                  </div>div>
                      </button>button>
                    ))}
                </div>div>
          
            {modal && (
                    <Modal title={title} items={items} onClose={() => setModal(null)} />
                  )}
          </>>
        );
}</></div>
