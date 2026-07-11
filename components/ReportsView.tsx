"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import type { RoomView, SheetRow } from "@/types";
import { parseThaiDate } from "@/lib/dateUtils";
import { isDoneStatus, isCancelledStatus } from "@/lib/constants";
import { exportCsv } from "@/lib/csvExport";
import { toast } from "@/lib/toast";

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

const CHART_COLORS: Record<string, string> = {
  "ย้ายเข้า":  "#22C55E",
  "ย้ายออก":  "#EF4444",
  "ชมห้อง":   "#A855F7",
  "ทำสะอาด":  "#EAB308",
  "ซ่อม":     "#F97316",
  "อื่นๆ":    "#64748B",
};

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

  // ---- Pie chart: tasks per type ----
  const byType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of filtered) {
      counts.set(t.type, (counts.get(t.type) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count, color: CHART_COLORS[type] || "#64748B" }));
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
          >📥 CSV</button>
          <button
            type="button"
            className="ac-btn ac-btn-ghost"
            onClick={exportPDF}
            title="พิมพ์รายงาน (PDF/หน้ากระดาษ A4)"
          >🖨 PDF</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="ac-reports-kpis">
        <KpiCard label="งานทั้งหมด" value={kpis.totalTasks.toString()} sub={`${days} วันล่าสุด`} accent="indigo" />
        <KpiCard label="งานเสร็จแล้ว" value={kpis.doneTasks.toString()} sub={`${kpis.completion}% สำเร็จ`} accent="green" />
        <KpiCard label="ค่าใช้จ่ายรวม" value={`฿ ${fmtBaht(kpis.totalCost)}`} sub="รวมทุกประเภท" accent="amber" />
        <KpiCard label="ยกเลิก" value={kpis.cancelled.toString()} sub="ลด churn งาน" accent="red" />
      </div>

      {/* Charts row 1 — bar (per building) + pie (per type) */}
      <div className="ac-reports-row">
        <div className="ac-reports-chart">
          <h3 className="ac-reports-chart-title">งานต่อตึก</h3>
          {byBuilding.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byBuilding}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="building" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366F1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="ac-reports-chart">
          <h3 className="ac-reports-chart-title">สัดส่วนประเภทงาน</h3>
          {byType.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={byType}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(props: { name?: string | number; value?: string | number }) => `${props.name ?? ""} (${props.value ?? 0})`}
                >
                  {byType.map((entry) => (
                    <Cell key={entry.type} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
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
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" interval={Math.max(0, Math.floor(byDay.length / 8) - 1)} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke="#0EA5E9" strokeWidth={2} dot={false} name="งานต่อวัน" />
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

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string;
  accent: "indigo" | "green" | "amber" | "red";
}) {
  return (
    <div className={`ac-reports-kpi ac-reports-kpi-${accent}`}>
      <div className="ac-reports-kpi-value">{value}</div>
      <div className="ac-reports-kpi-label">{label}</div>
      {sub && <div className="ac-reports-kpi-sub">{sub}</div>}
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
