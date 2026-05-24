"use client";

import { useEffect, useMemo, useState } from "react";
import type { SheetRow, RoomView } from "@/types";
import { isClosedStatus, isDoneStatus, isCancelledStatus } from "@/lib/constants";
import { usePersistedString } from "@/lib/usePersistedString";
import EmptyState from "./EmptyState";

type ViewMode = "month" | "day";
const VIEW_MODES: ViewMode[] = ["month", "day"];

interface Props {
  tasks: SheetRow[];
  activeBuilding: string;
  rooms?: RoomView[];
  onSelectRoom?: (r: RoomView) => void;
}

const TYPE_COLOR: Record<string, string> = {
  "ทำสะอาด": "#EAB308",
  "ย้ายเข้า": "#22C55E",
  "ย้ายออก": "#EF4444",
  "ชมห้อง": "#A855F7",
  "ซ่อม": "#F97316",
};

const TYPE_ORDER = ["ทำสะอาด", "ย้ายเข้า", "ย้ายออก", "ชมห้อง", "ซ่อม"];

const DAY_NAMES = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const MONTH_NAMES = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTH_NAMES_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function dmyKey(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabelShort(d: Date): string {
  // "จ 12 พ.ค."
  const dowIdx = (d.getDay() + 6) % 7;
  return `${DAY_NAMES[dowIdx]} ${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]}`;
}

// isClosedStatus moved to lib/constants for shared use

export default function CalendarView({ tasks, activeBuilding, rooms, onSelectRoom }: Props) {
  const roomMap = useMemo(() => {
    const m = new Map<string, RoomView>();
    (rooms || []).forEach((r) => m.set(`${r.building}|${r.room}`, r));
    return m;
  }, [rooms]);
  const [cursor, setCursor] = useState<Date>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Calendar view mode — persisted so a user who lives in day view doesn't
  // get bounced back to month on every refresh. Falls back to "month" for
  // any stored value we don't recognise (defensive against schema drift).
  const [viewModeRaw, setViewModeRaw] = usePersistedString(
    "calendarViewMode",
    "month",
    (v) => (VIEW_MODES as string[]).includes(v),
  );
  const viewMode = viewModeRaw as ViewMode;

  // Day-view focus date — independent from the month cursor so switching
  // modes keeps the user where they were. Defaults to today on first use.
  const [dayFocus, setDayFocus] = useState<Date>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  });

  const today = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  // group tasks by dmy key (filtered by activeBuilding)
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

  // Next 7 days (today + 6) preview — built once per render
  const week = useMemo(() => {
    const days: { date: Date; tasks: SheetRow[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const list = (tasksByDay.get(dmyKey(d)) || [])
        .filter((t) => !isClosedStatus(t.status));
      days.push({ date: d, tasks: list });
    }
    return days;
  }, [today, tasksByDay]);

  // Detect which task types actually appear this month — show only those
  // in the legend so we don't render colors that aren't relevant.
  const visibleTypes = useMemo(() => {
    const present = new Set<string>();
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    for (const [key, list] of tasksByDay.entries()) {
      // key = dd/mm/yyyy
      const parts = key.split("/");
      if (parts.length !== 3) continue;
      const mm = parseInt(parts[1], 10) - 1;
      const yy = parseInt(parts[2], 10);
      if (mm !== month || yy !== year) continue;
      for (const t of list) present.add(t.type);
    }
    return TYPE_ORDER.filter((t) => present.has(t));
  }, [tasksByDay, cursor]);

  // build month grid (Mon-Sun rows)
  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDow = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - startDow);

    const rows: { date: Date; inMonth: boolean }[][] = [];
    const cur = new Date(start);
    while (cur <= last || rows.length < 6) {
      const w: { date: Date; inMonth: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        w.push({ date: new Date(cur), inMonth: cur.getMonth() === month });
        cur.setDate(cur.getDate() + 1);
      }
      rows.push(w);
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
    setDayFocus(new Date(n.getFullYear(), n.getMonth(), n.getDate()));
  }

  // Day-view navigation — shifts focus +/- 1 day and keeps month cursor
  // synced so flipping back to month view lands on the right month.
  function shiftDay(deltaDays: number) {
    const next = new Date(dayFocus.getFullYear(), dayFocus.getMonth(), dayFocus.getDate() + deltaDays);
    setDayFocus(next);
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
    setSelectedDay(next);
  }

  // Keyboard ← / → step the day in day-view mode. Skipped while the user
  // is typing in a field (so arrow keys still move the text caret) and
  // when a modifier is held (don't fight browser/OS shortcuts). Month
  // mode ignores arrows — its prev/next are month-sized and less obvious
  // to drive blind, so we keep those button-only.
  useEffect(() => {
    if (viewMode !== "day") return;
    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); shiftDay(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); shiftDay(1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, dayFocus]);

  // Tasks for the day-view focus, grouped by status category for quick
  // scanning ("open work" vs "already done"). Ordered by type so the same
  // colour cluster reads together.
  const dayTasks = useMemo(() => {
    return (tasksByDay.get(dmyKey(dayFocus)) || []).slice().sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a.type);
      const ib = TYPE_ORDER.indexOf(b.type);
      const ra = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
      const rb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
      if (ra !== rb) return ra - rb;
      return (a.building + a.room).localeCompare(b.building + b.room);
    });
  }, [tasksByDay, dayFocus]);

  const dayGroups = useMemo(() => {
    const open: SheetRow[] = [];
    const done: SheetRow[] = [];
    const cancelled: SheetRow[] = [];
    for (const t of dayTasks) {
      if (isDoneStatus(t.status)) done.push(t);
      else if (isCancelledStatus(t.status)) cancelled.push(t);
      else open.push(t);
    }
    return { open, done, cancelled };
  }, [dayTasks]);

  const selectedTasks = selectedDay ? (tasksByDay.get(dmyKey(selectedDay)) || []) : [];
  const weekTotal = week.reduce((acc, d) => acc + d.tasks.length, 0);

  /** dd/MM/yyyy → "วันจันทร์ที่ 13 พฤษภาคม 2026" (Thai long form). */
  function dayHeadLabel(d: Date): string {
    const fullDayNames = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
    return `วัน${fullDayNames[d.getDay()]}ที่ ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  function renderTaskCard(t: SheetRow, idx: number) {
    const room = roomMap.get(`${t.building}|${t.room}`);
    const clickable = !!(room && onSelectRoom);
    return (
      <div
        key={`${dmyKey(dayFocus)}|${idx}|${t.building}|${t.room}|${t.type}`}
        className={`ac-cal-task ${clickable ? "is-clickable" : ""}`}
        onClick={() => clickable && onSelectRoom!(room!)}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
      >
        <span className="ac-cal-task-dot" style={{ background: TYPE_COLOR[t.type] || "#64748B" }} />
        <div className="ac-cal-task-main">
          <div className="ac-cal-task-line1">
            <strong>{t.type}</strong> · {t.building} {t.room}
            {clickable && <span className="ac-cal-task-arrow"> ›</span>}
          </div>
          {(t.customer || t.note || t.phone) && (
            <div className="ac-cal-task-line2">
              {t.customer && <span>{t.customer}</span>}
              {t.phone && <span> · {t.phone}</span>}
              {t.note && <span className="ac-task-note"> · {t.note}</span>}
            </div>
          )}
        </div>
        <span className={`ac-task-status ${isDoneStatus(t.status) ? "is-done" : isCancelledStatus(t.status) ? "is-cancelled" : ""}`}>
          {t.status || "ว่าง"}
        </span>
      </div>
    );
  }

  return (
    <div className="ac-calendar">
      <header className="ac-page-head ac-cal-head">
        <h2 className="ac-page-title">ปฏิทินงาน {activeBuilding !== "ทั้งหมด" && `· ${activeBuilding}`}</h2>
        <div className="ac-cal-nav ac-no-print">
          {/* View-mode toggle — segmented control between month grid and
              focused day view. Persists via usePersistedString. */}
          <div className="ac-cal-mode" role="radiogroup" aria-label="โหมดมุมมอง">
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === "month"}
              className={`ac-cal-mode-btn ${viewMode === "month" ? "is-active" : ""}`}
              onClick={() => setViewModeRaw("month")}
            >เดือน</button>
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === "day"}
              className={`ac-cal-mode-btn ${viewMode === "day" ? "is-active" : ""}`}
              onClick={() => setViewModeRaw("day")}
            >วัน</button>
          </div>
          {viewMode === "month" ? (
            <>
              <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={goPrev} aria-label="เดือนก่อน">‹</button>
              <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={goToday}>วันนี้</button>
              <span className="ac-cal-month">{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</span>
              <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={goNext} aria-label="เดือนถัดไป">›</button>
            </>
          ) : (
            <>
              <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={() => shiftDay(-1)} aria-label="วันก่อน">‹</button>
              <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={goToday}>วันนี้</button>
              <span className="ac-cal-month">{dayLabelShort(dayFocus)}</span>
              <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={() => shiftDay(1)} aria-label="วันถัดไป">›</button>
            </>
          )}
          <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={() => window.print()} title="พิมพ์/บันทึก PDF">🖨</button>
        </div>
      </header>

      {viewMode === "month" && (<>
      {/* 7-day preview strip — instant context for "what's coming up this week" */}
      <section className="ac-cal-week ac-no-print" aria-label="งาน 7 วันถัดไป">
        <div className="ac-cal-week-head">
          <span className="ac-cal-week-title">งาน 7 วันถัดไป</span>
          <span className="ac-cal-week-total">{weekTotal} รายการ</span>
        </div>
        <div className="ac-cal-week-strip">
          {week.map(({ date, tasks }, i) => {
            const isTodayDay = i === 0;
            return (
              <button
                key={dmyKey(date)}
                type="button"
                className={`ac-cal-week-day ${isTodayDay ? "is-today" : ""} ${tasks.length === 0 ? "is-empty" : ""}`}
                onClick={() => {
                  setCursor(new Date(date.getFullYear(), date.getMonth(), 1));
                  setSelectedDay(date);
                }}
                title={`${dayLabelShort(date)} — ${tasks.length} งาน`}
              >
                <div className="ac-cal-week-day-label">{isTodayDay ? "วันนี้" : dayLabelShort(date)}</div>
                <div className="ac-cal-week-day-count">{tasks.length}</div>
                {tasks.length > 0 && (
                  <div className="ac-cal-week-day-dots">
                    {TYPE_ORDER
                      .filter((t) => tasks.some((task) => task.type === t))
                      .slice(0, 5)
                      .map((t) => (
                        <span
                          key={t}
                          className="ac-cal-week-dot"
                          style={{ background: TYPE_COLOR[t] || "#64748B" }}
                        />
                      ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Type legend — always visible so user knows what each color means */}
      {visibleTypes.length > 0 && (
        <section className="ac-cal-legend ac-no-print" aria-label="คำอธิบายสี">
          {visibleTypes.map((t) => (
            <span key={t} className="ac-cal-legend-item">
              <span className="ac-cal-legend-swatch" style={{ background: TYPE_COLOR[t] || "#64748B" }} />
              <span className="ac-cal-legend-label">{t}</span>
            </span>
          ))}
        </section>
      )}

      <section className="ac-cal-grid">
        <div className="ac-cal-row ac-cal-dow">
          {DAY_NAMES.map((n) => (<div key={n} className="ac-cal-dow-cell">{n}</div>))}
        </div>
        {grid.map((weekRow, wi) => (
          <div key={wi} className="ac-cal-row">
            {weekRow.map(({ date, inMonth }, di) => {
              const k = dmyKey(date);
              const dayTasks = tasksByDay.get(k) || [];
              const openCount = dayTasks.filter((t) => !isClosedStatus(t.status)).length;
              const isToday = isSameDay(date, today);
              const isSelected = selectedDay && isSameDay(date, selectedDay);
              const typeCounts: Record<string, number> = {};
              dayTasks.forEach((t) => { typeCounts[t.type] = (typeCounts[t.type] || 0) + 1; });
              const orderedTypes = TYPE_ORDER.filter((t) => typeCounts[t]);
              const extra = orderedTypes.length > 4 ? orderedTypes.length - 4 : 0;
              return (
                <button
                  key={di}
                  className={`ac-cal-cell ${!inMonth ? "is-out" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${dayTasks.length > 0 ? "has-tasks" : ""}`}
                  onClick={() => setSelectedDay(date)}
                  aria-label={`${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${dayTasks.length ? `— ${dayTasks.length} งาน` : ""}`}
                >
                  <div className="ac-cal-cell-top">
                    <span className="ac-cal-date">{date.getDate()}</span>
                    {openCount > 0 && (
                      <span className="ac-cal-cell-count" aria-hidden>{openCount}</span>
                    )}
                  </div>
                  {dayTasks.length > 0 && (
                    <div className="ac-cal-dots">
                      {orderedTypes.slice(0, 4).map((type) => {
                        const count = typeCounts[type];
                        return (
                          <span
                            key={type}
                            className="ac-cal-dot"
                            style={{ background: TYPE_COLOR[type] || "#64748B" }}
                            title={`${type} (${count})`}
                          >
                            {count > 1 && <span className="ac-cal-dot-count">{count}</span>}
                          </span>
                        );
                      })}
                      {extra > 0 && (
                        <span className="ac-cal-dot-more" title={`+${extra} ประเภทอื่น`}>+{extra}</span>
                      )}
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
              {isSameDay(selectedDay, today) && <span className="ac-cal-today-pill">วันนี้</span>}
            </h3>
            <button className="ac-btn ac-btn-ghost ac-btn-sm" onClick={() => setSelectedDay(null)}>ปิด</button>
          </header>
          {selectedTasks.length === 0 ? (
            <EmptyState
              icon="calendar"
              compact
              title="ไม่มีงานในวันนี้"
              description="เลือกวันอื่นในปฏิทิน หรือเพิ่มงานใหม่ผ่านปุ่ม + ด้านล่าง"
            />
          ) : (
            <div className="ac-cal-task-list">
              {selectedTasks.map((t, i) => {
                const room = roomMap.get(`${t.building}|${t.room}`);
                const clickable = !!(room && onSelectRoom);
                return (
                <div
                  key={i}
                  className={`ac-cal-task ${clickable ? "is-clickable" : ""}`}
                  onClick={() => clickable && onSelectRoom!(room!)}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                >
                  <span className="ac-cal-task-dot" style={{ background: TYPE_COLOR[t.type] || "#64748B" }} />
                  <div className="ac-cal-task-main">
                    <div className="ac-cal-task-line1">
                      <strong>{t.type}</strong> · {t.building} {t.room}
                      {clickable && <span className="ac-cal-task-arrow"> ›</span>}
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
                );
              })}
            </div>
          )}
        </section>
      )}
      </>)}

      {viewMode === "day" && (
        <section className="ac-cal-day-view" aria-label="มุมมองรายวัน">
          <header className="ac-cal-day-view-head">
            <h3 className="ac-cal-day-view-title">
              {dayHeadLabel(dayFocus)}
              {isSameDay(dayFocus, today) && <span className="ac-cal-today-pill">วันนี้</span>}
            </h3>
            <div className="ac-cal-day-view-stats">
              <span className="ac-cal-day-view-stat" title="งานที่ยังไม่ปิด">
                <span className="ac-cal-day-view-stat-num">{dayGroups.open.length}</span>
                <span className="ac-cal-day-view-stat-label">ค้างอยู่</span>
              </span>
              <span className="ac-cal-day-view-stat" title="งานที่เสร็จแล้ว">
                <span className="ac-cal-day-view-stat-num">{dayGroups.done.length}</span>
                <span className="ac-cal-day-view-stat-label">เสร็จ</span>
              </span>
              {/* Always render the 3rd chip — a zero "ยกเลิก" count is
                  information too (the day has no cancellations). Muted
                  styling keeps a 0 from competing with real numbers. */}
              <span
                className={`ac-cal-day-view-stat ${dayGroups.cancelled.length === 0 ? "is-muted" : ""}`}
                title="งานที่ยกเลิก"
              >
                <span className="ac-cal-day-view-stat-num">{dayGroups.cancelled.length}</span>
                <span className="ac-cal-day-view-stat-label">ยกเลิก</span>
              </span>
            </div>
          </header>

          {dayTasks.length === 0 ? (
            <EmptyState
              icon="calendar"
              compact
              title="ไม่มีงานในวันนี้"
              description="เลื่อนไปวันถัดไปด้วยปุ่ม › หรือกด 'เดือน' เพื่อดูภาพรวม"
            />
          ) : (
            <div className="ac-cal-day-view-body">
              {dayGroups.open.length > 0 && (
                <div className="ac-cal-day-view-group">
                  <h4 className="ac-cal-day-view-group-title">ค้างอยู่ ({dayGroups.open.length})</h4>
                  <div className="ac-cal-task-list">
                    {dayGroups.open.map((t, i) => renderTaskCard(t, i))}
                  </div>
                </div>
              )}
              {dayGroups.done.length > 0 && (
                <div className="ac-cal-day-view-group is-done-group">
                  <h4 className="ac-cal-day-view-group-title">เสร็จแล้ว ({dayGroups.done.length})</h4>
                  <div className="ac-cal-task-list">
                    {dayGroups.done.map((t, i) => renderTaskCard(t, 1000 + i))}
                  </div>
                </div>
              )}
              {dayGroups.cancelled.length > 0 && (
                <div className="ac-cal-day-view-group is-cancelled-group">
                  <h4 className="ac-cal-day-view-group-title">ยกเลิก ({dayGroups.cancelled.length})</h4>
                  <div className="ac-cal-task-list">
                    {dayGroups.cancelled.map((t, i) => renderTaskCard(t, 2000 + i))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
