"use client";

import { useEffect, useMemo, useState } from "react";
import type { RoomRow, SheetRow } from "@/types";

type Props = {
  open: boolean;
  onClose: () => void;
  rooms: RoomRow[];
  tasks: SheetRow[];
  onAddTask?: () => void;
};

type RangeKey = "today" | "week" | "month";

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "วันนี้",
  week: "7 วันข้างหน้า",
  month: "30 วันข้างหน้า",
};

const TYPE_COLOR: Record<string, string> = {
  ทำสะอาด: "#EAB308",
  ย้ายเข้า: "#22C55E",
  ย้ายออก: "#EF4444",
  ชมห้อง: "#A855F7",
};

function parseDateDMY(s: string): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (!d || !mo || !y) return null;
  return new Date(y, mo - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtDateLabel(d: Date): string {
  const days = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function dateKey(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const ROOM_STATUS_GROUP = (raw: string): "vacant" | "occupied" | "repair" | "er" | "other" => {
  const s = String(raw || "").trim();
  if (s === "ว่าง" || s === "พร้อมขาย") return "vacant";
  if (s === "มีผู้เช่า" || s === "มีคนอยู่" || s === "อยู่") return "occupied";
  if (s === "ปรับปรุง" || s === "รอเข้าซ่อม" || s === "รอตรวจ" || s === "QC") return "repair";
  if (s === "ER") return "er";
  return "other";
};

export default function SummaryDrawer({ open, onClose, rooms, tasks, onAddTask }: Props) {
  const [range, setRange] = useState<RangeKey>("today");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const roomSummary = useMemo(() => {
    const map = new Map<string, { total: number; vacant: number; occupied: number; repair: number; er: number }>();
    for (const r of rooms) {
      const b = String(r.building || "").trim() || "—";
      if (!map.has(b)) map.set(b, { total: 0, vacant: 0, occupied: 0, repair: 0, er: 0 });
      const row = map.get(b)!;
      row.total += 1;
      const g = ROOM_STATUS_GROUP(String(r.status || ""));
      if (g === "vacant") row.vacant += 1;
      else if (g === "occupied") row.occupied += 1;
      else if (g === "repair") row.repair += 1;
      else if (g === "er") row.er += 1;
    }
    const list = Array.from(map.entries()).map(([building, v]) => ({ building, ...v }));
    list.sort((a, b) => a.building.localeCompare(b.building, "th"));
    const totals = list.reduce(
      (acc, x) => ({
        total: acc.total + x.total,
        vacant: acc.vacant + x.vacant,
        occupied: acc.occupied + x.occupied,
        repair: acc.repair + x.repair,
        er: acc.er + x.er,
      }),
      { total: 0, vacant: 0, occupied: 0, repair: 0, er: 0 }
    );
    return { list, totals };
  }, [rooms]);

  const taskGroups = useMemo(() => {
    const today = startOfDay(new Date());
    const horizon = new Date(today);
    if (range === "today") horizon.setDate(today.getDate());
    else if (range === "week") horizon.setDate(today.getDate() + 7);
    else horizon.setDate(today.getDate() + 30);

    const filtered = tasks.filter((t) => {
      const status = String(t.status || "").trim().toLowerCase();
      if (status === "เสร็จ" || status === "ยกเลิก" || status === "done" || status === "cancelled") return false;
      const d = parseDateDMY(String(t.date || ""));
      if (!d) return false;
      const sd = startOfDay(d);
      return sd >= today && sd <= horizon;
    });

    const byDate = new Map<string, SheetRow[]>();
    for (const t of filtered) {
      const k = String(t.date || "");
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k)!.push(t);
    }
    const groups = Array.from(byDate.entries()).map(([k, rows]) => {
      const d = parseDateDMY(k)!;
      const typeCounts = new Map<string, number>();
      for (const r of rows) {
        const t = String(r.type || "").trim() || "อื่นๆ";
        typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
      }
      return { date: d, key: k, rows, typeCounts: Array.from(typeCounts.entries()) };
    });
    groups.sort((a, b) => a.date.getTime() - b.date.getTime());
    return groups;
  }, [tasks, range]);

  const totalPending = taskGroups.reduce((s, g) => s + g.rows.length, 0);

  return (
    <>
      {open && <div className="ac-summary-overlay" onClick={onClose} />}
      <aside className={`ac-summary-drawer ${open ? "is-open" : ""}`} role="dialog" aria-label="สรุปภาพรวม">
        <header className="ac-summary-head">
          <h2>สรุปภาพรวม</h2>
          <button className="ac-summary-close" onClick={onClose} aria-label="ปิด">×</button>
        </header>

        <div className="ac-summary-body">
          <section className="ac-summary-section">
            <h3>สรุปห้องแยกตึก</h3>
            <div className="ac-summary-table-wrap">
              <table className="ac-summary-table">
                <thead>
                  <tr>
                    <th>ตึก</th>
                    <th className="num">รวม</th>
                    <th className="num">ว่าง</th>
                    <th className="num">มีผู้เช่า</th>
                    <th className="num">ซ่อม</th>
                    <th className="num">ER</th>
                  </tr>
                </thead>
                <tbody>
                  {roomSummary.list.map((r) => (
                    <tr key={r.building}>
                      <td>{r.building}</td>
                      <td className="num">{r.total}</td>
                      <td className="num"><span className="ac-pill pill-vacant">{r.vacant}</span></td>
                      <td className="num"><span className="ac-pill pill-occupied">{r.occupied}</span></td>
                      <td className="num"><span className="ac-pill pill-repair">{r.repair}</span></td>
                      <td className="num"><span className="ac-pill pill-er">{r.er}</span></td>
                    </tr>
                  ))}
                  <tr className="ac-summary-total">
                    <td>รวมทั้งหมด</td>
                    <td className="num">{roomSummary.totals.total}</td>
                    <td className="num">{roomSummary.totals.vacant}</td>
                    <td className="num">{roomSummary.totals.occupied}</td>
                    <td className="num">{roomSummary.totals.repair}</td>
                    <td className="num">{roomSummary.totals.er}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="ac-summary-section">
            <div className="ac-summary-section-head">
              <h3>งานค้าง <span className="ac-summary-count">({totalPending})</span></h3>
              <div className="ac-summary-range">
                {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                  <button
                    key={k}
                    className={`ac-range-btn ${range === k ? "is-active" : ""}`}
                    onClick={() => setRange(k)}
                  >
                    {RANGE_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>

            {taskGroups.length === 0 && (
              <div className="ac-summary-empty">ไม่มีงานค้างในช่วงนี้ 🎉</div>
            )}

            <ul className="ac-summary-day-list">
              {taskGroups.map((g) => (
                <li key={g.key} className="ac-summary-day">
                  <div className="ac-summary-day-head">
                    <span className="ac-summary-day-label">{fmtDateLabel(g.date)}</span>
                    <span className="ac-summary-day-count">{g.rows.length} งาน</span>
                  </div>
                  <div className="ac-summary-day-types">
                    {g.typeCounts.map(([t, n]) => (
                      <span key={t} className="ac-type-chip">
                        <span className="ac-type-dot" style={{ background: TYPE_COLOR[t] || "#94A3B8" }} />
                        {t} <b>{n}</b>
                      </span>
                    ))}
                  </div>
                  <ul className="ac-summary-task-list">
                    {g.rows.map((r, i) => (
                      <li key={i} className="ac-summary-task">
                        <span className="ac-type-dot" style={{ background: TYPE_COLOR[String(r.type)] || "#94A3B8" }} />
                        <span className="ac-summary-task-main">
                          <b>{String(r.type)}</b> {String(r.building)}-{String(r.room)}
                        </span>
                        {r.customer && <span className="ac-summary-task-sub">{String(r.customer)}</span>}
                        {r.note && <span className="ac-summary-task-note">{String(r.note)}</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
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
