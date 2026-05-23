"use client";

import { useEffect, useRef, useState } from "react";
import type { Part, RoomView } from "@/types";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * "เบิกอะไหล่" modal — captures who/when/where when an engineer
 * deducts parts from stock. Replaces the silent "ใช้" decrement.
 *
 * Form:
 *   - quantity (positive int, ≤ stock)
 *   - building (dropdown from rooms data)
 *   - room (text — engineer often knows by number, no cascading)
 *   - note (optional, e.g. "ซ่อมก๊อกน้ำห้องน้ำ")
 *
 * On submit: POST /api/part-requisitions { action: "add", partId, quantity, ... }
 * Server atomically decrements stock + appends log row.
 */

interface Props {
  open: boolean;
  part: Part | null;
  /** All rooms — drives the building dropdown. */
  rooms: RoomView[];
  onClose: () => void;
  onSaved?: () => void;
}

export default function RequisitionModal({ open, part, rooms, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);

  const [quantity, setQuantity] = useState("1");
  const [building, setBuilding] = useState("");
  const [room, setRoom] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset when opening — different part = fresh form
  useEffect(() => {
    if (!open || !part) return;
    setQuantity("1");
    setBuilding("");
    setRoom("");
    setNote("");
    setErr(null);
  }, [open, part]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open || !part) return null;

  const buildings = Array.from(new Set(rooms.map((r) => r.building))).sort();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!part) return;
    setErr(null);
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setErr("กรอกจำนวนเป็นตัวเลขบวก");
      return;
    }
    if (qty > part.stock) {
      setErr(`สต๊อกมีเพียง ${part.stock} ${part.unit}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/part-requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          partId: part.id,
          quantity: qty,
          building: building.trim(),
          room: room.trim(),
          note: note.trim(),
        }),
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
        aria-labelledby="ac-req-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ac-modal-head">
          <h2 id="ac-req-modal-title">เบิก: {part.name}</h2>
          <button
            type="button"
            className="ac-modal-close"
            onClick={onClose}
            aria-label="ปิด"
            disabled={submitting}
          >×</button>
        </header>

        <form onSubmit={submit} className="ac-modal-body">
          <div className="ac-req-stock-hint">
            สต๊อกปัจจุบัน: <strong>{part.stock} {part.unit}</strong>
          </div>

          <div className="ac-field">
            <label htmlFor="ac-req-quantity">
              จำนวนที่เบิก <span className="ac-required" aria-hidden>*</span>
            </label>
            <input
              id="ac-req-quantity"
              type="number"
              inputMode="numeric"
              min="1"
              max={part.stock}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))}
              required
              autoFocus
            />
            <span className="ac-field-hint">หน่วย: {part.unit}</span>
          </div>

          <div className="ac-form-row">
            <div className="ac-field">
              <label htmlFor="ac-req-building">ตึก (ไปใช้ที่)</label>
              <select
                id="ac-req-building"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
              >
                <option value="">— ไม่ระบุ —</option>
                {buildings.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="ac-field">
              <label htmlFor="ac-req-room">เลขห้อง</label>
              <input
                id="ac-req-room"
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="เช่น 101 หรือ ส่วนกลาง"
              />
            </div>
          </div>

          <div className="ac-field">
            <label htmlFor="ac-req-note">หมายเหตุ</label>
            <textarea
              id="ac-req-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ซ่อมก๊อกน้ำห้องน้ำ"
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
            >{submitting ? "กำลังบันทึก…" : "เบิก"}</button>
          </footer>
        </form>
      </div>
    </div>
  );
}
