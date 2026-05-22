"use client";

import { useEffect, useRef, useState } from "react";
import type { Vehicle } from "@/types";

/** Minimal shape needed for the building/room cascading select. */
export interface RoomChoice { building: string; room: string }
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * Add/Edit modal for vehicles per room.
 *
 * Reused for both create + edit. When `initial` is passed, fields
 * pre-fill and the submit becomes an update. Building + room are
 * editable on add (no room context) and locked on edit (changing
 * room means delete + re-add per principle of least surprise).
 *
 * If caller passes `prefillRoom`, the modal opens with that
 * building/room locked in — used when launching from a room-level
 * action ("เพิ่มมอเตอร์ไซค์ของห้องนี้").
 */

interface Props {
  open: boolean;
  initial?: Vehicle | null;
  prefillRoom?: { building: string; room: string } | null;
  rooms: RoomChoice[];
  onClose: () => void;
  onSaved?: () => void;
}

export default function AddVehicleModal({
  open, initial, prefillRoom, rooms, onClose, onSaved,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);

  const isEdit = !!initial;
  // Lock the building field when editing OR when caller pre-supplied it.
  // Lock room only if pre-supplied AND non-empty (passing room=""
  // means "scope to this building but let user pick the room").
  const lockBuilding = isEdit || !!prefillRoom?.building;
  const lockRoom = isEdit || (!!prefillRoom?.room && prefillRoom.room !== "");

  const [building, setBuilding] = useState("");
  const [room, setRoom] = useState("");
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setBuilding(initial.building);
      setRoom(initial.room);
      setPlate(initial.plate);
      setModel(initial.model);
      setColor(initial.color);
      setNote(initial.note);
    } else if (prefillRoom) {
      setBuilding(prefillRoom.building);
      setRoom(prefillRoom.room);
      setPlate("");
      setModel("");
      setColor("");
      setNote("");
    } else {
      setBuilding("");
      setRoom("");
      setPlate("");
      setModel("");
      setColor("");
      setNote("");
    }
    setErr(null);
  }, [open, initial, prefillRoom]);

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

  // Buildings + rooms-in-building, derived from data each render
  const buildings = Array.from(new Set(rooms.map((r) => r.building))).sort();
  const roomsInBuilding = rooms
    .filter((r) => r.building === building)
    .map((r) => r.room)
    .sort();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const trimmedPlate = plate.trim();
    if (!building) { setErr("เลือกตึก"); return; }
    if (!room) { setErr("เลือกห้อง"); return; }
    if (!trimmedPlate) { setErr("กรอกทะเบียน"); return; }

    setSubmitting(true);
    try {
      const fields = {
        plate: trimmedPlate,
        model: model.trim(),
        color: color.trim(),
        note: note.trim(),
      };
      const body = isEdit
        ? { action: "update", id: initial!.id, building, room, ...fields }
        : { action: "add", building, room, ...fields };
      const res = await fetch("/api/vehicles", {
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
        aria-labelledby="ac-vehicle-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ac-modal-head">
          <h2 id="ac-vehicle-modal-title">
            {isEdit ? "แก้ไขยานพาหนะ" : "เพิ่มยานพาหนะ"}
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
          <div className="ac-form-row">
            <div className="ac-field">
              <label htmlFor="ac-vehicle-building">
                ตึก <span className="ac-required" aria-hidden>*</span>
              </label>
              <select
                id="ac-vehicle-building"
                value={building}
                onChange={(e) => { setBuilding(e.target.value); setRoom(""); }}
                disabled={lockBuilding}
                required
              >
                <option value="">— เลือกตึก —</option>
                {buildings.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="ac-field">
              <label htmlFor="ac-vehicle-room">
                ห้อง <span className="ac-required" aria-hidden>*</span>
              </label>
              <select
                id="ac-vehicle-room"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                disabled={lockRoom || !building}
                required
              >
                <option value="">— เลือกห้อง —</option>
                {roomsInBuilding.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="ac-field">
            <label htmlFor="ac-vehicle-plate">
              ทะเบียน <span className="ac-required" aria-hidden>*</span>
            </label>
            <input
              id="ac-vehicle-plate"
              type="text"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="เช่น 1กข-1234 / กรุงเทพ"
              required
              autoFocus
            />
          </div>

          <div className="ac-form-row">
            <div className="ac-field">
              <label htmlFor="ac-vehicle-model">ยี่ห้อ/รุ่น</label>
              <input
                id="ac-vehicle-model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="เช่น Honda Click 125"
              />
            </div>
            <div className="ac-field">
              <label htmlFor="ac-vehicle-color">สี</label>
              <input
                id="ac-vehicle-color"
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="เช่น แดง, ดำ-ขาว"
              />
            </div>
          </div>

          <div className="ac-field">
            <label htmlFor="ac-vehicle-note">หมายเหตุ</label>
            <textarea
              id="ac-vehicle-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ของผู้เช่าคนที่ 1, จอดล็อก A2"
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
