"use client";

import { useEffect, useState } from "react";
import type { SheetRow } from "@/types";

interface Props {
  /** Task to edit — null hides the modal. Identity is the composite
   *  taskKey (date|building|room|type), used as the match payload. */
  task: SheetRow | null;
  onClose: () => void;
  /** Called after a successful save so the parent can refresh data. */
  onSaved?: () => void;
}

/**
 * EditTaskModal — single source of truth for the "แก้ไขงาน" form.
 *
 * Previously inlined in TasksList only, which meant the engineer kanban
 * + task detail drawer had no edit path at all. Extracted so any view
 * with task rows can trigger the same modal: pass `task` to open,
 * receive `onSaved` to refresh.
 *
 * Permits editing date / customer / phone / note regardless of task
 * status — the previous lockout that hid the edit button on done /
 * cancelled tasks made fixing typos on closed jobs impossible.
 *
 * The backend action `updateTask` is gated by `task.edit` permission
 * (allowed for sales / engineer / management). UI gating is the parent's
 * responsibility — this modal trusts that the button was rendered for
 * an authorised user.
 */
export default function EditTaskModal({ task, onClose, onSaved }: Props) {
  const [date, setDate] = useState("");
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset form whenever the bound task changes — open then re-open with
  // a different task should not show stale values from the previous edit.
  useEffect(() => {
    if (!task) return;
    setDate(task.date || "");
    setCustomer(task.customer || "");
    setPhone(task.phone || "");
    setNote(task.note || "");
    setErr(null);
  }, [task]);

  // ESC closes the modal — except while a save is in flight (avoid
  // dropping the request and leaving the sheet in an unknown state).
  useEffect(() => {
    if (!task) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, saving, onClose]);

  if (!task) return null;

  async function handleSave() {
    if (!task) return;
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/sheet/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Apps Script updateTask_ expects flat fields, not nested
          // match/set: it reads b.matchDate/matchType/matchBuilding/
          // matchRoom for the row lookup and b.date/customer/phone/note
          // for the new values. A previous nested-payload version
          // silently failed every edit with "task not found" because
          // b.matchDate was undefined.
          action: "updateTask",
          matchDate: task.date,
          matchType: task.type,
          matchBuilding: task.building,
          matchRoom: task.room,
          date,
          customer,
          phone,
          note,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON response" }));
      if (!data.ok) {
        const statusSuffix = res.status !== 200 ? ` (HTTP ${res.status})` : "";
        throw new Error(`${data.error || "ไม่สำเร็จ"}${statusSuffix}`);
      }
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  /** dd/MM/yyyy ↔ yyyy-MM-dd helpers — the sheet stores Thai-style
   *  dates but the native <input type="date"> wants ISO. */
  function dmyToIso(dmy: string): string {
    const m = (dmy || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  function isoToDmy(iso: string): string {
    const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  return (
    <div className="ac-modal-backdrop" onClick={() => !saving && onClose()}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="แก้ไขงาน">
        <header className="ac-modal-head">
          <div className="ac-modal-title">แก้ไขงาน</div>
          <div className="ac-modal-sub">{task.building}-{task.room} · {task.type}</div>
          <button
            className="ac-modal-close"
            onClick={() => !saving && onClose()}
            aria-label="ปิด"
            type="button"
          >×</button>
        </header>
        <div className="ac-modal-body">
          <div className="ac-field">
            <label htmlFor="ac-edit-task-date">วันที่</label>
            <input
              id="ac-edit-task-date"
              type="date"
              value={dmyToIso(date)}
              onChange={(e) => setDate(isoToDmy(e.target.value))}
            />
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>{date || "—"}</span>
          </div>
          <div className="ac-field">
            <label htmlFor="ac-edit-task-customer">ลูกค้า</label>
            <input
              id="ac-edit-task-customer"
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
          </div>
          <div className="ac-field">
            <label htmlFor="ac-edit-task-phone">เบอร์</label>
            <input
              id="ac-edit-task-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="ac-field">
            <label htmlFor="ac-edit-task-note">หมายเหตุ (ใส่เวลานัดที่นี่ได้ เช่น &quot;นัด 10 โมง&quot;)</label>
            <textarea
              id="ac-edit-task-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {err && <div className="ac-banner ac-banner-warn" role="alert">{err}</div>}
        </div>
        <footer className="ac-modal-foot">
          <button
            type="button"
            className="ac-btn ac-btn-ghost"
            disabled={saving}
            onClick={onClose}
          >ยกเลิก</button>
          <button
            type="button"
            className="ac-btn ac-btn-primary"
            disabled={saving}
            onClick={handleSave}
          >{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
        </footer>
      </div>
    </div>
  );
}
