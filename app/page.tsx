"use client";

import { useEffect, useState, useCallback } from "react";
import { SheetRow } from "@/types";
import KpiCards from "@/components/KpiCards";
import TodayTasks from "@/components/TodayTasks";
import CapacityWarning from "@/components/CapacityWarning";
import CleaningChart from "@/components/CleaningChart";
import { getBangkokNow } from "@/lib/dateUtils";
import { format } from "date-fns";

const THAI_DAYS_LONG = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_MONTHS_LONG = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function formatTodayThai(): string {
  const now = getBangkokNow();
  const dow = THAI_DAYS_LONG[now.getDay()];
  const d = now.getDate();
  const m = THAI_MONTHS_LONG[now.getMonth()];
  const y = now.getFullYear();
  return `วัน${dow}ที่ ${d} ${m} ${y}`;
}

type Status = "idle" | "loading" | "ok" | "error";

export default function Home() {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchData = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/sheet", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.error) {
        setErrorMsg(json.error ?? "เกิดข้อผิดพลาด");
        setStatus("error");
        return;
      }
      setRows(json.rows ?? []);
      setLastUpdated(format(new Date(), "HH:mm"));
      setStatus("ok");
    } catch {
      setErrorMsg("ไม่สามารถเชื่อมต่อได้");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchData();
    // refresh อัตโนมัติทุก 5 นาที
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium text-gray-900 dark:text-gray-50">Dashboard หอพัก</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatTodayThai()}</p>
        </div>
        <button
          onClick={fetchData}
          disabled={status === "loading"}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-50 mt-1"
          title="รีเฟรชข้อมูล"
        >
          <svg
            className={`w-4 h-4 ${status === "loading" ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {lastUpdated ? `อัปเดต ${lastUpdated}` : "โหลด"}
        </button>
      </div>

      {/* Error state */}
      {status === "error" && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-3">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">โหลดข้อมูลไม่สำเร็จ</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{errorMsg}</p>
          <p className="text-xs text-red-500 dark:text-red-500 mt-1">
            ตรวจสอบว่าตั้งค่า NEXT_PUBLIC_SHEET_CSV_URL ใน .env.local แล้ว
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {status === "loading" && rows.length === 0 && (
        <div className="flex flex-col gap-3 animate-pulse">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
          <div className="h-4 w-1/3 rounded bg-gray-100 dark:bg-gray-800" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {/* Main content */}
      {(status === "ok" || (status !== "idle" && rows.length > 0)) && (
        <div className="flex flex-col gap-6">
          <KpiCards rows={rows} />
          <TodayTasks rows={rows} />
          <CapacityWarning rows={rows} />
          <CleaningChart rows={rows} />
        </div>
      )}

      {status === "ok" && rows.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400 dark:text-gray-500 text-sm">ยังไม่มีข้อมูลใน Sheet</p>
        </div>
      )}
    </main>
  );
}
