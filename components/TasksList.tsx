"use client";

import { useState } from "react";
import type { SheetRow } from "@/types";

interface Props {
  tasks: SheetRow[];
  title: string;
  emptyText?: string;
  onChanged: () => void;
}

const TYPE_COLOR: Record<string, string> = {
  "ทำสะอาด": "#EAB308",
  "ย้ายเข้า": "#22C55E",
  "ย้ายออก": "#EF4444",
  "ชมห้อง": "#A855F7",
  "ซ่อม": "#F97316",
};

function isDone(status: string): boolean {
  const s = (status || "").trim();
  return s === "เสร็จ" || s === "done" || s === "ปิดแล้ว";
}

function isCancelled(status: string): boolean {
  const s = (status || "").trim();
  return s === "ยกเลิก" || s === "cancelled";
}

export default function TasksList({ tasks, title, emptyText, onChanged }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function changeStatus(t: SheetRow, newStatus: string) {
    const k = `${t.date}|${t.building}|${t.room}|${t.type}`;
    setBusyKey(k);
    setErr(null);
    try {
      const res = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateTaskStatus",
          date: t.date,
          building: t.building,
          room: t.room,
          type: t.type,
          status: newStatus,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "ไม่สำเร็จ");
      onChanged();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Network error";
      setErr(msg);
    } finally {
      setBusyKey(null);
    }
  }

  if (!tasks.length) {
    return (
      <section className="ac-tasks">
        <header className="ac-tasks-head">
          <h2 className="ac-tasks-title">{title}</h2>
        </header>
        <div className="ac-empty">{emptyText || "ไม่มีงานในรายการนี้"}</div>
      </section>
    );
  }

  return (
    <section className="ac-tasks">
      <header className="ac-tasks-head">
        <h2 className="ac-tasks-title">{title}</h2>
        <span className="ac-tasks-count">{tasks.length} รายการ</span>
      </header>

      {err && <div className="ac-banner ac-banner-warn">⚠ {err}</div>}

      <ul className="ac-tasks-list">
        {tasks.map((t, i) => {
          const k = `${t.date}|${t.building}|${t.room}|${t.type}|${i}`;
          const done = isDone(t.status);
          const cancelled = isCancelled(t.status);
          const dot = TYPE_COLOR[t.type] || "#64748B";
          return (
            <li
              key={k}
              className={`ac-task ${done ? "is-done" : ""} ${cancelled ? "is-cancelled" : ""}`}
            >
              <div className="ac-task-dot" style={{ background: dot }} />
              <div className="ac-task-main">
                <div className="ac-task-line1">
                  <span className="ac-task-type">{t.type}</span>
                  <span className="ac-task-room">
                    {t.building} · {t.room}
                  </span>
                  <span className="ac-task-date">{t.date}</span>
                </div>
                <div className="ac-task-line2">
                  {t.customer && <span>{t.customer}</span>}
                  {t.phone && <span> · {t.phone}</span>}
                  {t.note && <span className="ac-task-note"> — {t.note}</span>}
                </div>
              </div>
              <div className="ac-task-actions">
                {!done && !cancelled && (
                  <button
                    className="ac-btn ac-btn-primary ac-btn-sm"
                    disabled={busyKey === k}
                    onClick={() => changeStatus(t, "เสร็จ")}
                  >
                    {busyKey === k ? "..." : "ปิดงาน"}
                  </button>
                )}
                {!done && !cancelled && (
                  <button
                    className="ac-btn ac-btn-ghost ac-btn-sm"
                    disabled={busyKey === k}
                    onClick={() => changeStatus(t, "ยกเลิก")}
                    title="ยกเลิกงานนี้"
                  >
                    ✕
                  </button>
                )}
                {(done || cancelled) && (
                  <button
                    className="ac-btn ac-btn-ghost ac-btn-sm"
                    disabled={busyKey === k}
                    onClick={() => changeStatus(t, "ว่าง")}
                    title="ดึงกลับเป็นยังไม่เสร็จ"
                  >
                    คืน
                  </button>
                )}
                <span className={`ac-task-status ${done ? "is-done" : cancelled ? "is-cancelled" : ""}`}>
                  {done ? "เสร็จแล้ว" : cancelled ? "ยกเลิก" : t.status || "ว่าง"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
