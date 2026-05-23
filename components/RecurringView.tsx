"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecurringTemplate } from "@/types";
import { TASK_TYPES } from "@/lib/taskSchema";
import { Icon } from "@/lib/icons";
import { toast } from "@/lib/toast";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import ErrorBanner from "./ErrorBanner";

/**
 * Recurring task templates view (v3.17.0). Engineer + management see
 * a flat list with:
 *   - name / type / location / interval / next-run date
 *   - "Run check now" button (creates tasks for any template due today)
 *   - Add template form
 *   - Delete per row
 *
 * No auto-cron: the user clicks "Run check now" or the app could
 * trigger it on dashboard load in a future iteration. Manual is
 * intentional for now — predictable + auditable.
 */

interface Props {
  buildings: string[];
}

export default function RecurringView({ buildings }: Props) {
  const [rows, setRows] = useState<RecurringTemplate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Add-form state — inline at top of list
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("ทำสะอาด");
  const [building, setBuilding] = useState("");
  const [room, setRoom] = useState("");
  const [intervalDays, setIntervalDays] = useState("30");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/recurring", { cache: "no-store", signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRows(data.rows || []);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  async function runCheck() {
    setRunning(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const created = data.result?.created ?? 0;
      const skipped = data.result?.skipped ?? 0;
      if (created > 0) {
        toast.success(`สร้างงาน ${created} รายการแล้ว (ข้าม ${skipped})`);
      } else {
        toast.info(`ไม่มีงานครบรอบ — ตรวจ ${skipped} เทมเพลต`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "รันงานประจำไม่สำเร็จ");
    } finally {
      setRunning(false);
    }
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const interval = parseInt(intervalDays, 10);
    if (!trimmedName) { toast.error("กรอกชื่อ"); return; }
    if (!Number.isFinite(interval) || interval <= 0) { toast.error("รอบต้องเป็นจำนวนวันบวก"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          name: trimmedName,
          type,
          building: building.trim(),
          room: room.trim(),
          intervalDays: interval,
          note: note.trim(),
        }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Reset form
      setName("");
      setBuilding("");
      setRoom("");
      setIntervalDays("30");
      setNote("");
      setShowAdd(false);
      await load();
      toast.success("เพิ่มงานประจำแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(tpl: RecurringTemplate) {
    if (!confirm(`ลบ "${tpl.name}"?\n\nงานที่สร้างไปแล้วจะคงอยู่ — ลบเฉพาะเทมเพลต`)) return;
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: tpl.id }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows((prev) => (prev || []).filter((r) => r.id !== tpl.id));
      toast.success("ลบแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  // Days-until-next: helps the engineer see what's coming
  function daysUntil(nextStr: string): number | null {
    if (!nextStr) return null;
    const next = new Date(nextStr.replace(/-/g, "/"));
    if (isNaN(next.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  }

  return (
    <section className="ac-recurring" aria-label="งานประจำ">
      <header className="ac-recurring-head">
        <div>
          <h1 className="ac-recurring-title">
            <Icon name="calendar" size={22} />
            <span>งานประจำ</span>
            {rows && <span className="ac-recurring-count">({rows.length})</span>}
          </h1>
          <p className="ac-recurring-sub">
            เทมเพลตงานที่จะสร้างซ้ำตามรอบ — กด "ตรวจและสร้าง" เพื่อรันให้ครบกำหนด
          </p>
        </div>
        <div className="ac-recurring-actions">
          <button
            type="button"
            className="ac-btn ac-btn-primary"
            onClick={runCheck}
            disabled={running}
          >{running ? "กำลังตรวจ…" : "▶ ตรวจและสร้าง"}</button>
          <button
            type="button"
            className="ac-btn ac-btn-ghost"
            onClick={() => setShowAdd((v) => !v)}
          >{showAdd ? "ยกเลิก" : "+ เพิ่มเทมเพลต"}</button>
        </div>
      </header>

      {showAdd && (
        <form className="ac-recurring-add-form" onSubmit={submitAdd}>
          <div className="ac-form-row">
            <div className="ac-field">
              <label htmlFor="ac-rec-name">ชื่อ</label>
              <input
                id="ac-rec-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น ล้างแอร์ห้อง 101"
                required
              />
            </div>
            <div className="ac-field">
              <label htmlFor="ac-rec-type">ประเภท</label>
              <select
                id="ac-rec-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="ac-form-row">
            <div className="ac-field">
              <label htmlFor="ac-rec-building">ตึก</label>
              <select
                id="ac-rec-building"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
              >
                <option value="">— เลือกตึก —</option>
                {buildings.filter((b) => b !== "ทั้งหมด").map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="ac-field">
              <label htmlFor="ac-rec-room">เลขห้อง</label>
              <input
                id="ac-rec-room"
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="101"
              />
            </div>
            <div className="ac-field">
              <label htmlFor="ac-rec-interval">รอบ (วัน)</label>
              <input
                id="ac-rec-interval"
                type="number"
                min="1"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="ac-field">
            <label htmlFor="ac-rec-note">หมายเหตุ</label>
            <input
              id="ac-rec-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เปลี่ยนฟิลเตอร์"
              maxLength={300}
            />
          </div>
          <div className="ac-recurring-add-footer">
            <button type="submit" className="ac-btn ac-btn-primary" disabled={submitting}>
              {submitting ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </form>
      )}

      <ErrorBanner message={err} onRetry={() => load()} onDismiss={() => setErr(null)} />

      {loading && !rows ? (
        <LoadingState />
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="ยังไม่มีงานประจำ"
          description="เพิ่มเทมเพลตเช่น 'ล้างแอร์ทุก 90 วัน' เพื่อให้ระบบสร้างงานให้อัตโนมัติ"
          action={{ label: "+ เพิ่มเทมเพลตแรก", onClick: () => setShowAdd(true) }}
        />
      ) : (
        <div className="ac-recurring-table-wrap">
          <table className="ac-recurring-table">
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>ประเภท</th>
                <th>ห้อง</th>
                <th>รอบ</th>
                <th>รันถัดไป</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tpl) => {
                const days = daysUntil(tpl.nextRunDate);
                const tone = days == null ? "" : days < 0 ? "is-overdue" : days <= 7 ? "is-soon" : "";
                return (
                  <tr key={tpl.id} className={tone}>
                    <td>
                      <div className="ac-recurring-name">{tpl.name}</div>
                      {tpl.note && <div className="ac-recurring-note">{tpl.note}</div>}
                    </td>
                    <td>{tpl.type}</td>
                    <td>
                      {tpl.building || tpl.room
                        ? `${tpl.building}${tpl.room ? " · " + tpl.room : ""}`
                        : "—"}
                    </td>
                    <td>{tpl.intervalDays} วัน</td>
                    <td>
                      <span className="ac-recurring-next">{tpl.nextRunDate || "—"}</span>
                      {days != null && (
                        <span className={`ac-recurring-days ${tone}`}>
                          {days < 0 ? `เลย ${Math.abs(days)} วัน`
                            : days === 0 ? "วันนี้"
                            : `อีก ${days} วัน`}
                        </span>
                      )}
                    </td>
                    <td>
                      {tpl.active ? (
                        <span className="ac-recurring-active">เปิดใช้</span>
                      ) : (
                        <span className="ac-recurring-inactive">ปิด</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ac-btn ac-btn-danger ac-btn-sm"
                        onClick={() => remove(tpl)}
                      >ลบ</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
