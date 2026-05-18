"use client";

import { useState } from "react";
import {
  FACILITY_TYPES, FACILITY_STATUS_LIST,
  INTERVAL_OPTIONS, FACILITY_DEFAULT_INTERVAL_DAYS,
} from "@/lib/constants";
import type { FacilityType, FacilityStatus } from "@/types";

interface Props {
  open: boolean;
  buildings: string[];
  submitting: boolean;
  /** ถ้ามี = edit mode (prefill); ถ้าไม่มี = add mode */
  initial?: {
    id: string;
    building: string;
    type: string;
    name: string;
    installDate: string;
    lastService: string;
    status: string;
    note: string;
    intervalDays?: number;
  };
  onClose: () => void;
  onSubmit: (entry: {
    id?: string;
    building: string;
    type: FacilityType;
    name: string;
    installDate: string;
    lastService: string;
    status: FacilityStatus;
    note: string;
    intervalDays: number;
  }) => void;
}

export default function AddFacilityModal({
  open, buildings, submitting, initial, onClose, onSubmit,
}: Props) {
  const isEdit = !!initial;
  const [building, setBuilding] = useState(initial?.building || buildings[0] || "");
  const [type, setType] = useState<FacilityType>(
    (initial?.type as FacilityType) || "ลิฟต์"
  );
  const [name, setName] = useState(initial?.name || "");
  const [installDate, setInstallDate] = useState(initial?.installDate || "");
  const [lastService, setLastService] = useState(initial?.lastService || "");
  const [status, setStatus] = useState<FacilityStatus>(
    (initial?.status as FacilityStatus) || "ใช้งานได้"
  );
  const [note, setNote] = useState(initial?.note || "");
  const [intervalDays, setIntervalDays] = useState<number>(
    typeof initial?.intervalDays === "number"
      ? initial.intervalDays
      : (FACILITY_DEFAULT_INTERVAL_DAYS[(initial?.type as string) || "ลิฟต์"] ?? 0)
  );

  if (!open) return null;

  function handleTypeChange(t: FacilityType) {
    setType(t);
    if (!isEdit) {
      setIntervalDays(FACILITY_DEFAULT_INTERVAL_DAYS[t] ?? 0);
    }
  }

  function handleSubmit() {
    onSubmit({
      id: initial?.id,
      building,
      type,
      name: name.trim(),
      installDate,
      lastService,
      status,
      note: note.trim(),
      intervalDays,
    });
  }

  return (
    <div className="ac-modal-backdrop" onClick={() => !submitting && onClose()}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title">{isEdit ? "แก้ไขสาธารณูปโภค" : "เพิ่มสาธารณูปโภค"}</div>
            <div className="ac-modal-sub">{building || "—"}</div>
          </div>
          <button className="ac-modal-close" onClick={() => !submitting && onClose()}>✕</button>
        </header>

        <div className="ac-modal-body">
          <div className="ac-field">
            <label>ตึก</label>
            <select value={building} onChange={(e) => setBuilding(e.target.value)} disabled={isEdit}>
              {buildings.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            {isEdit && (
              <span style={{ fontSize: 11, color: "#94A3B8" }}>ห้ามย้ายตึก (แก้ไขเท่านั้น)</span>
            )}
          </div>

          <div className="ac-field">
            <label>ประเภท</label>
            <select value={type} onChange={(e) => handleTypeChange(e.target.value as FacilityType)}>
              {FACILITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="ac-field">
            <label>ชื่อ / รุ่น</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ลิฟต์ Mitsubishi #1"
            />
          </div>

          <div className="ac-field">
            <label>วันติดตั้ง</label>
            <input type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)} />
          </div>

          <div className="ac-field">
            <label>วันบริการล่าสุด</label>
            <input
              type="date"
              value={lastService}
              onChange={(e) => setLastService(e.target.value)}
            />
            <span style={{ fontSize: 11, color: "#94A3B8" }}>เว้นว่างถ้ายังไม่เคยมีการบริการ</span>
          </div>

          <div className="ac-field">
            <label>สถานะ</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as FacilityStatus)}>
              {FACILITY_STATUS_LIST.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="ac-field">
            <label>รอบบำรุง</label>
            <select
              value={intervalDays}
              onChange={(e) => setIntervalDays(Number(e.target.value))}
            >
              {INTERVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="ac-field">
            <label>หมายเหตุ (optional)</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น สัญญาบำรุงรักษากับ XYZ ถึง 12/2026"
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
            disabled={submitting || !building}
            onClick={handleSubmit}
          >{submitting ? "กำลังบันทึก..." : "บันทึก"}</button>
        </footer>
      </div>
    </div>
  );
}
