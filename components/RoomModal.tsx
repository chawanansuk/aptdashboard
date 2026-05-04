"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import type { RoomView } from "@/types";
import { STATUS_LABEL, STATUS_DOT, RAW_STATUS_OPTIONS } from "@/lib/constants";
import { canEditTenant } from "@/lib/permissions";

interface Props {
  room: RoomView;
  saving: boolean;
  status: string;
  tenant: string;
  phone: string;
  contractEnd: string;
  note: string;
  price: string;
  onChange: (patch: Partial<{
    status: string; tenant: string; phone: string;
    contractEnd: string; note: string; price: string;
  }>) => void;
  onClose: () => void;
  onSave: () => void;
  onAddTaskHere: () => void;
}

export default function RoomModal({
  room, saving, status, tenant, phone, contractEnd, note, price,
  onChange, onClose, onSave, onAddTaskHere,
}: Props) {
  const { data: session } = useSession();
  const canEdit = canEditTenant(session?.user?.role);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="ac-modal-backdrop" onClick={onClose}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title">{room.building} {room.room}</div>
            <div className="ac-modal-sub">
              <span className="ac-legend-dot" style={{ background: STATUS_DOT[room.status] }} />
              {STATUS_LABEL[room.status]} · ชั้น {room.floor || "-"}
            </div>
          </div>
          <button className="ac-modal-close" onClick={onClose}>✕</button>
        </header>
        <div className="ac-modal-body">
          {!canEdit && (
            <div style={{ fontSize: 12, color: "#94A3B8", padding: "4px 0" }}>
              ดูข้อมูลอย่างเดียว · เฉพาะ admin แก้ไขข้อมูลห้องได้
            </div>
          )}

          <label className="ac-field">
            <span>ราคา/เดือน (บาท)</span>
            <input type="text" inputMode="numeric" value={price} onChange={(e) => onChange({ price: e.target.value })} placeholder="เช่น 3500" readOnly={!canEdit} />
          </label>

          <label className="ac-field">
            <span>สถานะ (ในชีต)</span>
            <select value={status} onChange={(e) => onChange({ status: e.target.value })} disabled={!canEdit}>
              <option value="">- เลือก -</option>
              {RAW_STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </label>
          <label className="ac-field">
            <span>ผู้เช่าปัจจุบัน</span>
            <input type="text" value={tenant} onChange={(e) => onChange({ tenant: e.target.value })} placeholder="ชื่อผู้เช่า" readOnly={!canEdit} />
          </label>
          <label className="ac-field">
            <span>เบอร์ติดต่อ</span>
            <input type="tel" value={phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="08x-xxx-xxxx" readOnly={!canEdit} />
          </label>
          <label className="ac-field">
            <span>วันสัญญาหมด</span>
            <input type="text" value={contractEnd} onChange={(e) => onChange({ contractEnd: e.target.value })} placeholder="dd/MM/yyyy" readOnly={!canEdit} />
          </label>
          <label className="ac-field">
            <span>หมายเหตุ</span>
            <input type="text" value={note} onChange={(e) => onChange({ note: e.target.value })} placeholder="บันทึกเพิ่มเติม" readOnly={!canEdit} />
          </label>

          {room.upcomingTasks.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid #F1F5F9", margin: "6px 0" }} />
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>งานที่มาถึง</div>
              {room.upcomingTasks.map((t, i) => (
                <div key={i} className="ac-modal-row">
                  <span>{t.date} · {t.type}</span>
                  <strong>{t.note || t.customer || "-"}</strong>
                </div>
              ))}
            </>
          )}

          {room.pastTasks.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid #F1F5F9", margin: "6px 0" }} />
              <button
                type="button"
                className="ac-history-toggle"
                onClick={() => setShowHistory((v) => !v)}
              >
                <span>{showHistory ? "▾" : "▸"} ประวัติงาน ({room.pastTasks.length})</span>
              </button>
              {showHistory && (
                <div className="ac-history-list">
                  {room.pastTasks.map((t, i) => {
                    const s = (t.status || "").trim();
                    const isDone = s === "เสร็จ" || s === "done" || s === "ปิดแล้ว";
                    const isCancel = s === "ยกเลิก" || s === "cancelled";
                    return (
                      <div key={i} className={`ac-modal-row ac-history-row ${isDone ? "is-done" : ""} ${isCancel ? "is-cancelled" : ""}`}>
                        <span>{t.date} · {t.type}{t.creator ? ` · โดย ${t.creator}` : ""}</span>
                        <span className="ac-history-meta">
                          {t.customer && <span>{t.customer} </span>}
                          <strong className="ac-history-status">{s || "—"}</strong>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <footer className="ac-modal-foot">
          <button
            className="ac-btn ac-btn-secondary ac-btn-foot-start"
            onClick={onAddTaskHere}
            disabled={saving}
            title="เพิ่มงานใหม่สำหรับห้องนี้"
          >
            + เพิ่มงานที่ห้องนี้
          </button>
          <button className="ac-btn ac-btn-ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
          {canEdit && (
            <button className="ac-btn ac-btn-primary" onClick={onSave} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
          )}
        </footer>
      </div>
    </div>
  );
}
