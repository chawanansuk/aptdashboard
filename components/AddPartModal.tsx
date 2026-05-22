"use client";

import { useEffect, useRef, useState } from "react";
import { PART_CATEGORIES, type Part, type PartCategory } from "@/types";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * Add/Edit modal for inventory parts (Task 37).
 *
 * Reused for both create + edit. When `initial` is passed, fields
 * pre-fill and the API call becomes update. The submit button label
 * + heading flip accordingly.
 */

interface Props {
  open: boolean;
  initial?: Part | null;
  onClose: () => void;
  onSaved?: () => void;
}

export default function AddPartModal({ open, initial, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);

  const isEdit = !!initial;

  const [name, setName] = useState("");
  const [category, setCategory] = useState<PartCategory>("ทั่วไป");
  const [stock, setStock] = useState<string>("0");
  const [threshold, setThreshold] = useState<string>("");
  const [unit, setUnit] = useState<string>("ชิ้น");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset on open — initial may change between sessions
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setCategory((initial?.category as PartCategory) ?? "ทั่วไป");
    setStock(String(initial?.stock ?? 0));
    setThreshold(initial?.threshold ? String(initial.threshold) : "");
    setUnit(initial?.unit ?? "ชิ้น");
    setNote(initial?.note ?? "");
    setErr(null);
  }, [open, initial]);

  // Esc to close
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
    if (!trimmedName) {
      setErr("กรุณาใส่ชื่ออะไหล่");
      return;
    }
    const stockNum = Number(stock);
    if (!Number.isFinite(stockNum) || stockNum < 0) {
      setErr("จำนวนคงเหลือต้องเป็นตัวเลข ≥ 0");
      return;
    }
    let threshNum = 0;
    if (threshold.trim()) {
      threshNum = Number(threshold);
      if (!Number.isFinite(threshNum) || threshNum < 0) {
        setErr("จุดสั่งซื้อต้องเป็นตัวเลข ≥ 0");
        return;
      }
    }

    setSubmitting(true);
    try {
      const body = isEdit
        ? { action: "update", id: initial!.id, name: trimmedName, category, stock: stockNum, threshold: threshNum, unit: unit.trim() || "ชิ้น", note: note.trim() }
        : { action: "add",                       name: trimmedName, category, stock: stockNum, threshold: threshNum, unit: unit.trim() || "ชิ้น", note: note.trim() };
      const res = await fetch("/api/parts", {
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
        aria-labelledby="ac-part-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ac-modal-head">
          <h2 id="ac-part-modal-title">
            {isEdit ? "แก้ไขอะไหล่" : "เพิ่มอะไหล่"}
          </h2>
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
            <label htmlFor="ac-part-name">
              ชื่ออะไหล่ <span className="ac-required" aria-hidden>*</span>
            </label>
            <input
              id="ac-part-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ก๊อกน้ำ, หลอด LED, ลูกบิด"
              required
              autoFocus
            />
          </div>

          <div className="ac-form-row">
            <div className="ac-field">
              <label htmlFor="ac-part-category">หมวด</label>
              <select
                id="ac-part-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as PartCategory)}
              >
                {PART_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="ac-field">
              <label htmlFor="ac-part-unit">หน่วย</label>
              <input
                id="ac-part-unit"
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="ชิ้น / ม. / ลิตร"
              />
            </div>
          </div>

          <div className="ac-form-row">
            <div className="ac-field">
              <label htmlFor="ac-part-stock">
                จำนวนคงเหลือ <span className="ac-required" aria-hidden>*</span>
              </label>
              <input
                id="ac-part-stock"
                type="number"
                min="0"
                step="1"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                required
              />
            </div>
            <div className="ac-field">
              <label htmlFor="ac-part-threshold">
                จุดสั่งซื้อ <span className="ac-field-hint-inline">(เตือนเมื่อ ≤ ค่านี้)</span>
              </label>
              <input
                id="ac-part-threshold"
                type="number"
                min="0"
                step="1"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="0 = ไม่เตือน"
              />
            </div>
          </div>

          <div className="ac-field">
            <label htmlFor="ac-part-note">หมายเหตุ</label>
            <textarea
              id="ac-part-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ยี่ห้อ, ขนาด, ที่ซื้อ"
              maxLength={500}
            />
          </div>

          {err && <div className="ac-form-error" role="alert">{err}</div>}

          <footer className="ac-modal-foot">
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
