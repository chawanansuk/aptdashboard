"use client";

import { useEffect, useMemo, useState } from "react";
import type { RoomRow, SheetRow } from "@/types";
import { parseSheetDate, getBangkokNow } from "@/lib/dateUtils";
import { TASK_TYPE_COLOR } from "@/lib/constants";
import EmptyState from "./EmptyState";

type Props = {
  open: boolean;
  onClose: () => void;
  rooms: RoomRow[];
  tasks: SheetRow[];
  onAddTask?: () => void;
  onTaskClick?: (task: SheetRow) => void;
};

type RangeKey = "today" | "tomorrow" | "week" | "month" | "overdue";

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "วันนี้",
  tomorrow: "พรุ่งนี้",
  week: "7 วัน",
  month: "30 วัน",
  overdue: "ค้างเกินกำหนด",
};

const RANGE_ORDER: RangeKey[] = ["today", "tomorrow", "week", "month", "overdue"];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtShort(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function isPending(status: string): boolean {
  const s = String(status || "").trim().toLowerCase();
  return s !== "เสร็จ" && s !== "ยกเลิก" && s !== "done" && s !== "cancelled";
}

export default function SummaryDrawer({ open, onClose, tasks, onAddTask, onTaskClick }: Props) {
  const [range, setRange] = useState<RangeKey>("today");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Pre-compute counts for every range tab so badges can show numbers
  const rangeCounts = useMemo(() => {
    const today = startOfDay(getBangkokNow()); // Bangkok calendar day (see #157)
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const day7 = new Date(today); day7.setDate(today.getDate() + 7);
    const day30 = new Date(today); day30.setDate(today.getDate() + 30);

    const counts: Record<RangeKey, number> = { today: 0, tomorrow: 0, week: 0, month: 0, overdue: 0 };
    for (const t of tasks) {
      if (!isPending(String(t.status || ""))) continue;
      const d = parseSheetDate(String(t.date || ""));
      if (!d) continue;
      const sd = startOfDay(d);
      if (sd.getTime() < today.getTime()) counts.overdue++;
      else if (sd.getTime() === today.getTime()) counts.today++;
      else if (sd.getTime() === tomorrow.getTime()) counts.tomorrow++;
      if (sd.getTime() >= today.getTime() && sd.getTime() <= day7.getTime()) counts.week++;
      if (sd.getTime() >= today.getTime() && sd.getTime() <= day30.getTime()) counts.month++;
    }
    return counts;
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const today = startOfDay(getBangkokNow()); // Bangkok calendar day (see #157)
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const day7 = new Date(today); day7.setDate(today.getDate() + 7);
    const day30 = new Date(today); day30.setDate(today.getDate() + 30);

    const filtered = tasks.filter((t) => {
      if (!isPending(String(t.status || ""))) return false;
      const d = parseSheetDate(String(t.date || ""));
      if (!d) return false;
      const sd = startOfDay(d);
      if (range === "today") return sd.getTime() === today.getTime();
      if (range === "tomorrow") return sd.getTime() === tomorrow.getTime();
      if (range === "week") return sd.getTime() >= today.getTime() && sd.getTime() <= day7.getTime();
      if (range === "month") return sd.getTime() >= today.getTime() && sd.getTime() <= day30.getTime();
      if (range === "overdue") return sd.getTime() < today.getTime();
      return false;
    });

    // Sort by date asc; same date keeps original order
    return filtered.sort((a, b) => {
      const da = parseSheetDate(String(a.date || ""))?.getTime() ?? 0;
      const db = parseSheetDate(String(b.date || ""))?.getTime() ?? 0;
      return da - db;
    });
  }, [tasks, range]);

  return (
    <>
      {open && <div className="ac-summary-overlay" onClick={onClose} />}
      <aside className={`ac-summary-drawer ${open ? "is-open" : ""}`} role="dialog" aria-label="สรุปภาพรวม">
        <header className="ac-summary-head">
          <h2>สรุปภาพรวม</h2>
          <button className="ac-summary-close" onClick={onClose} aria-label="ปิด">×</button>
        </header>

        <div className="ac-summary-body ac-summary-body-tasks">
          <section className="ac-summary-section">
            <div className="ac-summary-section-head">
              <h3>งานค้าง <span className="ac-summary-count">({rangeCounts[range]})</span></h3>
            </div>

            <div className="ac-summary-range-tabs" role="tablist" aria-label="ช่วงวันที่">
              {RANGE_ORDER.map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={range === k}
                  className={`ac-range-btn ${range === k ? "is-active" : ""} ${k === "overdue" && rangeCounts.overdue > 0 ? "has-overdue" : ""}`}
                  onClick={() => setRange(k)}
                >
                  <span>{RANGE_LABEL[k]}</span>
                  {rangeCounts[k] > 0 && <span className="ac-range-count">{rangeCounts[k]}</span>}
                </button>
              ))}
            </div>

            {visibleTasks.length === 0 ? (
              <EmptyState
                icon="celebration"
                tone="celebration"
                compact
                title="ไม่มีงานในช่วงนี้ 🎉"
                description="ทุกอย่างเรียบร้อย — ไม่มีงานที่ต้องทำในช่วงเวลาที่เลือก"
              />
            ) : (
              <ul className="ac-summary-task-rows">
                {visibleTasks.map((t, i) => {
                  const d = parseSheetDate(String(t.date || ""));
                  const dateLabel = d ? fmtShort(d) : String(t.date || "—");
                  const type = String(t.type || "");
                  const room = `${String(t.building || "")}-${String(t.room || "")}`;
                  return (
                    <li
                      key={`${t.date}-${t.building}-${t.room}-${t.type}-${i}`}
                      className={`ac-summary-row ${onTaskClick ? "is-clickable" : ""}`}
                      onClick={onTaskClick ? () => onTaskClick(t) : undefined}
                      onKeyDown={onTaskClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTaskClick(t); } } : undefined}
                      role={onTaskClick ? "button" : undefined}
                      tabIndex={onTaskClick ? 0 : undefined}
                    >
                      <span className="ac-summary-row-date">{dateLabel}</span>
                      <span
                        className="ac-summary-row-type"
                        style={{ background: (TASK_TYPE_COLOR[type] || "#94A3B8") + "22", color: TASK_TYPE_COLOR[type] || "#475569" }}
                      >
                        {type || "อื่นๆ"}
                      </span>
                      <span className="ac-summary-row-room">{room}</span>
                      <span className="ac-summary-row-customer">
                        {t.customer && <span>{String(t.customer)}</span>}
                        {t.phone && <span className="ac-summary-row-phone"> · {String(t.phone)}</span>}
                      </span>
                      {t.note && <span className="ac-summary-row-note">{String(t.note)}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {onAddTask && (
          <button
            type="button"
            className="ac-summary-fab"
            onClick={onAddTask}
            aria-label="เพิ่มงาน"
          >
            <svg
              className="ac-summary-fab-icon"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="ac-summary-fab-text">เพิ่มงาน</span>
          </button>
        )}
      </aside>
    </>
  );
}
