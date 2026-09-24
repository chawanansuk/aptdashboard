"use client";

import { Icon } from "@/lib/icons";
import { useMemo, useState } from "react";
import {
  BarChart, Bar, LabelList,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RoomView, SheetRow } from "@/types";
import { parseThaiDate } from "@/lib/dateUtils";
import { isDoneStatus, isCancelledStatus } from "@/lib/constants";
import { exportCsv } from "@/lib/csvExport";
import { toast } from "@/lib/toast";
import PageHeader from "./PageHeader";

interface Props {
  rooms: RoomView[];
  tasks: SheetRow[];
}

/**
 * Reports & analytics view (management only — route-gated at app/page.tsx).
 *
 * Data philosophy: derive everything from data already loaded in the
 * dashboard hook (rooms + tasks). No new API endpoint — saves a roundtrip
 * and keeps Reports consistent with what the user sees elsewhere.
 *
 * Filter: 30-day window (rolling) + optional building. Most reports
 * questions ("เดือนนี้ทำเสร็จกี่งาน", "ตึกไหนใช้จ่ายเยอะสุด") cleanly
 * answer at this granularity.
 *
 * Export:
 *   - CSV (papaparse) — BOM utf-8 prefix so Excel TH reads correctly
 *   - PDF — window.print + @media print CSS in globals
 */

/*
 * Chart styling (V2 group D) — every value is a token, so the three charts
 * follow the theme instead of carrying their own hexes:
 *  - ONE data hue (--chart-series) for all three single-measure charts.
 *    They used to be indigo (bars), sky (line) and a six-colour pie, for
 *    no reason a reader could decode.
 *  - Grid: hairline, solid, one step off the surface — recessive.
 *  - Text (ticks, values, tooltip) in text tokens, never the series
 *    colour; recharts' defaults paint tooltip items and pie labels in the
 *    data colour, which is how the yellow "ทำสะอาด (2)" ended up unreadable.
 *  - Bars capped at 24px with a 4px rounded data end.
 */
const SERIES = "var(--chart-series)";
const GRID = "var(--color-border)";
const AXIS_TICK = { fill: "var(--color-text-muted)", fontSize: 12 };
const VALUE_LABEL = { fill: "var(--color-text)", fontSize: 12, fontWeight: 600 };
const TOOLTIP = {
  contentStyle: {
    background: "var(--color-surface)", border: "1px solid var(--color-border)",
    borderRadius: 8, boxShadow: "var(--shadow-soft)", fontSize: 13,
  },
  labelStyle: { color: "var(--color-text)", fontWeight: 600 },
  itemStyle: { color: "var(--color-text)" },
  cursor: { fill: "color-mix(in srgb, var(--chart-series) 8%, transparent)" },
} as const;

function fmtBaht(n: number): string {
  return n.toLocaleString("th-TH");
}

function dmy(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function ReportsView({ rooms, tasks }: Props) {
  // ---- Filter state ----
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [building, setBuilding] = useState<string>("ทั้งหมด");

  const buildings = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (t.building) set.add(t.building);
    return ["ทั้งหมด", ...Array.from(set).sort()];
  }, [tasks]);

  // ---- Window slice ----
  const filtered = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
    return (tasks || []).filter((t) => {
      if (building !== "ทั้งหมด" && t.building !== building) return false;
      const d = parseThaiDate(t.date);
      if (!d) return false;
      return d.getTime() >= cutoff.getTime();
    });
  }, [tasks, days, building]);

  // ---- KPI computations ----
  const kpis = useMemo(() => {
    const done = filtered.filter((t) => isDoneStatus(t.status));
    // Exclude cancelled tasks — a cancelled job's quoted cost was never
    // spent, counting it inflates the window total (audit r5).
    const totalCost = filtered.reduce(
      (sum, t) => sum + (isCancelledStatus(t.status) ? 0 : (t.cost || 0)), 0);
    // Days-to-done = ปัจจุบันเราไม่มี completedAt; approximate ว่า task ที่
    // เสร็จคือเสร็จในวันเดียวกับ date — เลยเทียบจำนวนงานทั้งหมด/เสร็จเป็น
    // proxy ของ "completion rate"
    const completion = filtered.length > 0
      ? Math.round((done.length / filtered.length) * 100)
      : 0;
    const cancelled = filtered.filter((t) => isCancelledStatus(t.status)).length;
    return {
      totalTasks: filtered.length,
      doneTasks: done.length,
      completion,
      totalCost,
      cancelled,
    };
  }, [filtered]);

  // ---- Bar chart: tasks per building ----
  const byBuilding = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of filtered) {
      counts.set(t.building, (counts.get(t.building) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([building, count]) => ({ building, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // ---- Tasks per type — sorted bars (was a pie; see the chart below) ----
  const byType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of filtered) {
      counts.set(t.type, (counts.get(t.type) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // ---- Line chart: tasks per day (last N days) ----
  const byDay = useMemo(() => {
    const counts = new Map<string, number>();
    const now = new Date();
    // Seed with zeros for every day in the window
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      counts.set(dmy(d), 0);
    }
    for (const t of filtered) {
      // Normalize via the parser — raw ISO-dated rows (Date-typed sheet
      // cells) never matched the dd/MM/yyyy seed keys, silently missing
      // from the per-day chart (audit r5).
      const d = parseThaiDate(t.date);
      if (!d) continue;
      const key = dmy(d);
      if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
  }, [filtered, days]);

  // ---- Export CSV ----
  // papaparse (~45KB) is only needed the moment the user clicks Export,
  // so it's dynamically imported here instead of at module load — keeps
  // it out of the Reports view chunk that loads just to *view* charts.
  function exportCSV() {
    // Route through lib/csvExport — the ONLY exporter with the CSV
    // formula-injection guard (= + - @ prefixes) and RFC-4180 quoting.
    // The previous Papa.unparse path let a note like "=SUM(...)" execute
    // when the file opened in Excel/Sheets (audit r5). Also drops the
    // on-demand papaparse download entirely.
    exportCsv(
      `aptcloud-tasks-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered,
      [
        { header: "วันที่", value: (t) => t.date },
        { header: "ประเภท", value: (t) => t.type },
        { header: "ตึก", value: (t) => t.building },
        { header: "ห้อง", value: (t) => t.room },
        { header: "ลูกค้า", value: (t) => t.customer || "" },
        { header: "เบอร์", value: (t) => t.phone || "" },
        { header: "สถานะ", value: (t) => t.status || "" },
        { header: "หมายเหตุ", value: (t) => t.note || "" },
        { header: "ค่าใช้จ่าย", value: (t) => String(t.cost || 0) },
      ],
    );
    toast.success(`Export ${filtered.length} แถวสำเร็จ`);
  }

  function exportPDF() {
    // ใช้ window.print + @media print CSS — ไม่ต้องเพิ่ม react-pdf
    window.print();
  }

  // Suppress unused warning while we keep rooms for future drill-down
  void rooms;

  return (
    <section className="ac-reports">
      <PageHeader
        title="รายงาน"
        icon="summary"
        subtitle="สรุปงานและค่าใช้จ่ายตามช่วงเวลาและตึก — ส่งออกเป็น CSV/PDF ได้"
      />
      {/* Filter bar */}
      <div className="ac-reports-filters">
        <div className="ac-reports-filter-group">
          <span className="ac-reports-filter-label">ช่วงเวลา:</span>
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`ac-chip ${days === d ? "is-active" : ""}`}
              onClick={() => setDays(d)}
            >{d} วันล่าสุด</button>
          ))}
        </div>
        <div className="ac-reports-filter-group">
          <label htmlFor="ac-reports-building">
            <span className="ac-reports-filter-label">ตึก:</span>
          </label>
          <select
            id="ac-reports-building"
            className="ac-reports-select"
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
          >
            {buildings.map((b) => (<option key={b} value={b}>{b}</option>))}
          </select>
        </div>
        <div className="ac-reports-filter-group" style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className="ac-btn ac-btn-ghost"
            onClick={() => void exportCSV()}
            disabled={filtered.length === 0}
            title="ดาวน์โหลด CSV (เปิดใน Excel/Google Sheets ได้)"
          ><Icon name="download" /> CSV</button>
          <button
            type="button"
            className="ac-btn ac-btn-ghost"
            onClick={exportPDF}
            title="พิมพ์รายงาน (PDF/หน้ากระดาษ A4)"
          ><Icon name="print" /> PDF</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="ac-overview-cards">
        <KpiCard label="งานทั้งหมด" value={kpis.totalTasks.toString()} sub={`${days} วันล่าสุด`} tone="neutral" />
        <KpiCard label="งานเสร็จแล้ว" value={kpis.doneTasks.toString()} sub={`${kpis.completion}% สำเร็จ`} tone="good" />
        {/* Tone follows the DATA, not the row position: a red "0 ยกเลิก"
            used to shout at a number that is good news. */}
        <KpiCard label="ค่าใช้จ่ายรวม" value={`฿ ${fmtBaht(kpis.totalCost)}`} sub="รวมทุกประเภท" tone="neutral" />
        <KpiCard label="ยกเลิก" value={kpis.cancelled.toString()} sub="ลด churn งาน" tone={kpis.cancelled > 0 ? "danger" : "neutral"} />
      </div>

      {/* Charts row 1 — bar (per building) + pie (per type) */}
      <div className="ac-reports-row">
        <div className="ac-reports-chart">
          <h3 className="ac-reports-chart-title">งานต่อตึก</h3>
          {byBuilding.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byBuilding} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="building" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
                <Tooltip {...TOOLTIP} />
                {/* ปิด entry animation ทุกกราฟในหน้านี้ — ปุ่ม PDF ใช้ window.print()
                    ถ้ากดตอนกราฟยังวิ่งอยู่ กระดาษที่พิมพ์ได้แท่ง/วงกลมครึ่งเดียว */}
                <Bar dataKey="count" name="งาน" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                  <LabelList dataKey="count" position="top" {...VALUE_LABEL} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="ac-reports-chart">
          {/* Was a six-colour pie. Its palette (the task-type colours) fails
              the categorical checks — ทำสะอาด yellow is too light to read as a
              mark, ซ่อม orange vs ทำสะอาด yellow are too close even for full
              colour vision, ย้ายเข้า green vs ย้ายออก red collapse for
              red-green colour blindness — and a pie is a poor way to compare
              close counts anyway. Sorted bars need no colour for identity:
              the type name is on the axis and the count at the bar end. */}
          <h3 className="ac-reports-chart-title">งานตามประเภท</h3>
          {byType.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, byType.length * 40 + 24)}>
              <BarChart data={byType} layout="vertical" margin={{ top: 4, right: 36, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="type" width={68} tick={{ ...AXIS_TICK, fill: "var(--color-text)" }} axisLine={{ stroke: GRID }} tickLine={false} />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey="count" name="งาน" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
                  <LabelList dataKey="count" position="right" {...VALUE_LABEL} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2 — line (per day) */}
      <div className="ac-reports-row">
        <div className="ac-reports-chart ac-reports-chart-wide">
          <h3 className="ac-reports-chart-title">งานต่อวัน · {days} วันล่าสุด</h3>
          {byDay.every((d) => d.count === 0) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              {/* One series → no legend box: the title already says what's
                  plotted (a one-swatch legend only restated it). */}
              <LineChart data={byDay} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="date" interval={Math.max(0, Math.floor(byDay.length / 8) - 1)} tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
                <Tooltip {...TOOLTIP} cursor={{ stroke: GRID }} />
                <Line
                  type="monotone" dataKey="count" name="งาน" stroke={SERIES} strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round" dot={false}
                  activeDot={{ r: 5, fill: SERIES, stroke: "var(--color-surface)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Footer note */}
      <p className="ac-reports-foot">
        ข้อมูลคำนวณจาก task records ที่โหลดอยู่ในหน้านี้ ({filtered.length} รายการ) · กดปุ่ม CSV/PDF เพื่อ export
      </p>
    </section>
  );
}

/**
 * V2: this used to be a third stat-card style (.ac-reports-kpi) with its
 * own 3px coloured rail, its own type scale and value-above-label order —
 * next to OverviewCards and InsightsCards that meant three cards saying
 * the same kind of thing three different ways. It renders the shared
 * .ac-overview-card now; only the tone class differs, and tone still
 * tints the number when it is a warning.
 */
function KpiCard({ label, value, sub, tone }: {
  label: string; value: string; sub?: string;
  tone: "neutral" | "good" | "warn" | "danger";
}) {
  return (
    <div className={`ac-overview-card ac-overview-card-${tone}`}>
      <div className="ac-overview-card-label">{label}</div>
      <div className="ac-overview-card-value">{value}</div>
      {sub && <div className="ac-overview-card-sub">{sub}</div>}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="ac-reports-chart-empty">
      ไม่มีข้อมูลในช่วงเวลานี้
    </div>
  );
}
