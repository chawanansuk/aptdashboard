"use client";

import { useMemo, useState } from "react";
import type { SheetRow } from "@/types";
import { parseThaiDate } from "@/lib/dateUtils";

interface Props {
  tasks: SheetRow[];
  activeBuilding: string;
}

const TYPE_COLOR: Record<string, string> = {
  "ทำสะอาด": "#EAB308",
  "ย้ายเข้า": "#22C55E",
  "ย้ายออก": "#EF4444",
  "ชมห้อง": "#A855F7",
  "ซ่อม": "#F97316",
};

const DAY_NAMES = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const MONTH_NAMES = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function dmyKey(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function CalendarView({ tasks, activeBuilding }: Props) {
  const [cursor, setCursor] = useState<Date>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const today = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  // group tasks by dmy key
  const tasksByDay = useMemo(() => {
    const m = new Map<string, SheetRow[]>();
    const filtered = activeBuilding === "ทั้งหมด" ? tasks : tasks.filter((t) => t.building === activeBuilding);
    for (const t of filtered) {
      const key = t.date;
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return m;
  }, [tasks, activeBuilding]);

  // build month grid (Mon-Sun rows)
  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    // start = Monday of week containing first day
    const startDow = (first.getDay() + 6) % 7; // 0=Mon
    const start = new Date(year, month, 1 - startDow);

    const rows: { date: Date; inMonth: boolean }[][] = [];
    const cur = new Date(start);
    while (cur <= last || rows.length < 6) {
      const week: { date: Date; inMonth: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        week.push({ date: new Date(cur), inMonth: cur.getMonth() === month });
        cur.setDate(cur.getDate() + 1);
      }
      rows.push(week);
      if (rows.length >= 6 && cur > last) break;
    }
    return rows;
  }, [cursor]);

  function goPrev() { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)); }
  function goNext() { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)); }
  function goToday() {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
    setSelectedDay(new Date(n.getFullYear(), n.getMonth(), n.getDate()));
  }

  const selectedTasks = selectedDay ? (tasksByDay.get(dmyKey(selectedDay)) || []) : [];

  return (
    <div className="ac-calendar">
      <header className="ac-page-head ac-cal-head">
        <h2 className="ac-page-title">ปฏิทินงาน {activeBuilding !== "ทั้งหมด" && `· ${activeBuilding}`}</h2>
        <div className="ac-cal-nav">
          <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={goPrev} aria-label="เดือนก่อน">‹</button>
          <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={goToday}>วันนี้</button>
          <span className="ac-cal-month">{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</span>
          <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={goNext} aria-label="เดือนถัดไป">›</button>
        </div>
      </header>

      <section className="ac-cal-grid">
        <div className="ac-cal-row ac-cal-dow">
          {DAY_NAMES.map((n) => (<div key={n} className="ac-cal-dow-cell">{n}</div>))}
        </div>
        {grid.map((week, wi) => (
          <div key={wi} className="ac-cal-row">
            {week.map(({ date, inMonth }, di) => {
              const k = dmyKey(date);
              const dayTasks = tasksByDay.get(k) || [];
              const isToday = isSameDay(date, today);
              const isSelected = selectedDay && isSameDay(date, selectedDay);
              const typeCounts: Record<string, number> = {};
              dayTasks.forEach((t) => { typeCounts[t.type] = (typeCounts[t.type] || 0) + 1; });
              return (
                <button
                  key={di}
                  className={`ac-cal-cell ${!inMonth ? "is-out" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
                  onClick={() => setSelectedDay(date)}
                >
                  <div className="ac-cal-date">{date.getDate()}</div>
                  {dayTasks.length > 0 && (
                    <div className="ac-cal-dots">
                      {Object.entries(typeCounts).slice(0, 4).map(([type, count]) => (
                        <span key={type} className="ac-cal-dot" style={{ background: TYPE_COLOR[type] || "#64748B" }} title={`${type} (${count})`}>
                          {count > 1 && <span className="ac-cal-dot-count">{count}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </section>

      {selectedDay && (
        <section className="ac-cal-day-detail">
          <header className="ac-tasks-head">
            <h3 className="ac-tasks-title">
              {selectedDay.getDate()} {MONTH_NAMES[selectedDay.getMonth()]} {selectedDay.getFullYear()}
              <span className="ac-tasks-count">({selectedTasks.length})</span>
            </h3>
            <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={() => setSelectedDay(null)}>ปิด</button>
          </header>
          {selectedTasks.length === 0 ? (
            <div className="ac-empty">ไม่มีงานในวันนี้</div>
          ) : (
            <div className="ac-cal-task-list">
              {selectedTasks.map((t, i) => (
                <div key={i} className="ac-cal-task">
                  <span className="ac-cal-task-dot" style={{ background: TYPE_COLOR[t.type] || "#64748B" }} />
                  <div className="ac-cal-task-main">
                    <div className="ac-cal-task-line1">
                      <strong>{t.type}</strong> · {t.building} {t.room}
                    </div>
                    {(t.customer || t.note) && (
                      <div className="ac-cal-task-line2">
                        {t.customer && <span>{t.customer}</span>}
                        {t.phone && <span> · {t.phone}</span>}
                        {t.note && <span className="ac-task-note"> · {t.note}</span>}
                      </div>
                    )}
                  </div>
                  <span className={`ac-task-status ${t.status === "เสร็จ" ? "is-done" : t.status === "ยกเลิก" ? "is-cancelled" : ""}`}>
                    {t.status || "ว่าง"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
