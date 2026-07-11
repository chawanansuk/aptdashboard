"use client";

import { useEffect, useRef, useState } from "react";
import {
  LEAD_STAGES, LEAD_SOURCES,
  type Lead, type LeadStage, type LeadSource,
} from "@/types";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { findLeadByPhone } from "@/lib/leadLink";

interface Props {
  open: boolean;
  initial?: Lead | null;
  /** Pre-fill stage when adding a Lead from a specific column. */
  initialStage?: LeadStage;
  onClose: () => void;
  onSaved?: () => void;
  /** Optional: surface a "สร้างงานย้ายเข้า" button when stage is
   *  "ทำสัญญา"/"ปิดดีล". Caller is expected to open AddTaskModal
   *  pre-filled from this Lead's contact info. */
  onCreateMoveinTask?: (lead: Lead) => void;
  /** Current leads — enables the duplicate-phone warning on add. The
   *  auto-link path deduped by phone since day one, but manual adds
   *  never did (audit r5): two ops could file the same prospect twice. */
  existingLeads?: Lead[];
}

export default function AddLeadModal({ open, initial, initialStage, onClose, onSaved, onCreateMoveinTask, existingLeads }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);
  const isEdit = !!initial;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState<LeadSource>("Walk-in");
  const [interest, setInterest] = useState("");
  const [stage, setStage] = useState<LeadStage>("ใหม่");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setPhone(initial?.phone ?? "");
    setSource((initial?.source as LeadSource) ?? "Walk-in");
    setInterest(initial?.interest ?? "");
    setStage((initial?.stage as LeadStage) ?? initialStage ?? "ใหม่");
    setNote(initial?.note ?? "");
    setErr(null);
  }, [open, initial, initialStage]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const trimmedName = name.trim();
    if (!trimmedName) { setErr("กรอกชื่อลูกค้า"); return; }
    // Duplicate-phone guard (add only; editing keeps its own number).
    // Warn + confirm instead of hard-block: shared/house numbers exist.
    if (!isEdit && existingLeads && phone.trim()) {
      const dup = findLeadByPhone(existingLeads, phone);
      if (dup) {
        const ok = window.confirm(
          `เบอร์นี้มี Lead อยู่แล้ว: "${dup.name}" (สถานะ ${dup.stage})\n\nต้องการเพิ่มซ้ำอีกรายการหรือไม่?`,
        );
        if (!ok) return;
      }
    }
    setSubmitting(true);
    try {
      const body = isEdit
        ? { action: "update", id: initial!.id, name: trimmedName, phone: phone.trim(), source, interest: interest.trim(), stage, note: note.trim() }
        : { action: "add",                       name: trimmedName, phone: phone.trim(), source, interest: interest.trim(), stage, note: note.trim() };
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onSaved?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ac-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={ref}
        className="ac-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-lead-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ac-modal-head">
          <h2 id="ac-lead-modal-title">{isEdit ? "แก้ไข Lead" : "เพิ่ม Lead"}</h2>
          <button
            type="button"
            className="ac-modal-close"
            onClick={onClose}
            aria-label="ปิด"
            disabled={submitting}
          >×</button>
        </header>

        <form onSubmit={submit} className="ac-modal-body">
          <div className="ac-field">
            <label htmlFor="ac-lead-name">
              ชื่อลูกค้า <span className="ac-required" aria-hidden>*</span>
            </label>
            <input
              id="ac-lead-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="ac-form-row">
            <div className="ac-field">
              <label htmlFor="ac-lead-phone">เบอร์โทร</label>
              <input
                id="ac-lead-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08x-xxx-xxxx"
              />
            </div>
            <div className="ac-field">
              <label htmlFor="ac-lead-source">ช่องทาง</label>
              <select
                id="ac-lead-source"
                value={source}
                onChange={(e) => setSource(e.target.value as LeadSource)}
              >
                {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="ac-field">
            <label htmlFor="ac-lead-interest">สนใจห้อง/ราคา</label>
            <input
              id="ac-lead-interest"
              type="text"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="เช่น ตึก KL ชั้น 3, 4,000-5,500"
            />
          </div>

          <div className="ac-field">
            <label htmlFor="ac-lead-stage">Stage</label>
            <select
              id="ac-lead-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as LeadStage)}
            >
              {LEAD_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="ac-field">
            <label htmlFor="ac-lead-note">หมายเหตุ</label>
            <textarea
              id="ac-lead-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ความต้องการเพิ่มเติม / นัดดู / ฯลฯ"
              maxLength={1000}
            />
          </div>

          {err && <div className="ac-form-error" role="alert">{err}</div>}

          <footer className="ac-modal-foot">
            {/* Lead → Task shortcut — visible only on edit (existing Lead)
                AND when stage advanced enough to warrant move-in scheduling. */}
            {isEdit && onCreateMoveinTask && (stage === "ทำสัญญา" || stage === "ปิดดีล") && (
              <button
                type="button"
                className="ac-btn ac-btn-secondary"
                onClick={() => { onCreateMoveinTask(initial!); onClose(); }}
                disabled={submitting}
                title="สร้างงานย้ายเข้าจาก Lead นี้"
              >📥 สร้างงานย้ายเข้า</button>
            )}
            <button
              type="button"
              className="ac-btn ac-btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >ยกเลิก</button>
            <button
              type="submit"
              className="ac-btn ac-btn-primary"
              disabled={submitting}
            >{submitting ? "กำลังบันทึก…" : (isEdit ? "บันทึก" : "เพิ่ม")}</button>
          </footer>
        </form>
      </div>
    </div>
  );
}
