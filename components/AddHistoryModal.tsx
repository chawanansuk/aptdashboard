"use client";

import { useState } from "react";
import { HISTORY_TYPES } from "@/lib/constants";
import type { RoomHistoryType } from "@/types";

interface Props {
  open: boolean;
  building: string;
  room: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (entry: {
    date: string;
    type: RoomHistoryType;
    description: string;
    cost: string;
    photoUrl: string;
  }) => void;
}

export default function AddHistoryModal({
  open, building, room, submitting, onClose, onSubmit,
}: Props) {
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<RoomHistoryType>("ซ่อม");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  if (!open) return null;

  function reset() {
    setDescription("");
    setCost("");
    setPhotoUrl("");
  }

  function handleSubmit() {
    onSubmit({ date, type, description: description.trim(), cost: cost.trim(), photoUrl: photoUrl.trim() });
  }

  return (
    <div className="ac-modal-backdrop" onClick={() => !submitting && onClose()}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title">บันทึกประวัติ</div>
            <div className="ac-modal-sub">{building} {room}</div>
          </div>
          <button className="ac-modal-close" onClick={() => !submitting && onClose()}>✕</button>
        </header>

        <div className="ac-modal-body">
          <div className="ac-field">
            <label>วันที่</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="ac-field">
            <label>ประเภท</label>
            <select value={type} onChange={(e) => setType(e.target.value as RoomHistoryType)}>
              {HISTORY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="ac-field">
            <label>รายละเอียด</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="เช่น เปลี่ยนคอมเพรสเซอร์แอร์ ยี่ห้อ Mitsu"
            />
          </div>

          <div className="ac-field">
            <label>ค่าใช้จ่าย (บาท)</label>
            <input
              type="text"
              inputMode="numeric"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="เช่น 2500 (เว้นว่างได้ถ้าไม่มี)"
            />
          </div>

          <div className="ac-field">
            <label>รูปภาพ URL (optional)</label>
            <input
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://drive.google.com/... (paste link จาก Drive)"
            />
            <span style={{ fontSize: 11, color: "#94A3B8" }}>วิธี: Google Drive → คลิกขวารูป → Share → Anyone with link → Copy link</span>
          </div>
        </div>

        <footer className="ac-modal-foot">
          <button
            className="ac-btn ac-btn-ghost"
            disabled={submitting}
            onClick={() => { reset(); onClose(); }}
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
