"use client";

import { useState } from "react";
import { EQUIPMENT_TYPES, EQUIPMENT_STATUS_LIST } from "@/lib/constants";
import type { EquipmentType, EquipmentStatus } from "@/types";

interface Props {
  open: boolean;
  building: string;
  room: string;
  submitting: boolean;
  /** ถ้ามี = edit mode (prefill); ถ้าไม่มี = add mode */
  initial?: {
    id: string;
    type: string;
    brand: string;
    installDate: string;
    lastService: string;
    status: string;
    note: string;
  };
  onClose: () => void;
  onSubmit: (entry: {
    id?: string;
    type: EquipmentType;
    brand: string;
    installDate: string;
    lastService: string;
    status: EquipmentStatus;
    note: string;
  }) => void;
}

export default function AddEquipmentModal({
  open, building, room, submitting, initial, onClose, onSubmit,
}: Props) {
  const isEdit = !!initial;
  const [type, setType] = useState<EquipmentType>(
    (initial?.type as EquipmentType) || "แอร์"
  );
  const [brand, setBrand] = useState(initial?.brand || "");
  const [installDate, setInstallDate] = useState(initial?.installDate || "");
  const [lastService, setLastService] = useState(initial?.lastService || "");
  const [status, setStatus] = useState<EquipmentStatus>(
    (initial?.status as EquipmentStatus) || "ปกติ"
  );
  const [note, setNote] = useState(initial?.note || "");

  if (!open) return null;

  function handleSubmit() {
    onSubmit({
      id: initial?.id,
      type,
      brand: brand.trim(),
      installDate,
      lastService,
      status,
      note: note.trim(),
    });
  }

  return (
    <div className="ac-modal-backdrop" onClick={() => !submitting && onClose()}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title">{isEdit ? "แก้ไขอุปกรณ์" : "เพิ่มอุปกรณ์"}</div>
            <div className="ac-modal-sub">{building} {room}</div>
          </div>
          <button className="ac-modal-close" onClick={() => !submitting && onClose()}>✕</button>
        </header>

        <div className="ac-modal-body">
          <div className="ac-field">
            <label>ประเภท</label>
            <select value={type} onChange={(e) => setType(e.target.value as EquipmentType)}>
              {EQUIPMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="ac-field">
            <label>ยี่ห้อ / รุ่น</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="เช่น Mitsubishi MS-SF18VC"
            />
          </div>

          <div className="ac-field">
            <label>วันติดตั้ง</label>
            <input type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)} />
          </div>

          <div className="ac-field">
            <label>วันซ่อมล่าสุด</label>
            <input
              type="date"
              value={lastService}
              onChange={(e) => setLastService(e.target.value)}
            />
            <span style={{ fontSize: 11, color: "#94A3B8" }}>เว้นว่างถ้ายังไม่เคยซ่อม</span>
          </div>

          <div className="ac-field">
            <label>สถานะ</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus)}>
              {EQUIPMENT_STATUS_LIST.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="ac-field">
            <label>หมายเหตุ (optional)</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ติดตั้งใหม่ใน 5/2024, รับประกัน 2 ปี"
            />
          </div>
        </div>

        <footer className="ac-modal-foot">
          <button
            className="ac-btn ac-btn-ghost"
            disabled={submitting}
            onClick={onClose}
          >ยกเลิก</button>
          <button
            className="ac-btn ac-btn-primary"
            disabled={submitting}
            onClick={handleSubmit}
          >{submitting ? "กำลังบันทึก..." : "บันทึก"}</button>
        </footer>
      </div>
    </div>
  );
}
