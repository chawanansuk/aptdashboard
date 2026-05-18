"use client";

import { useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { canAddSalesTask, canAddEngTask } from "@/lib/permissions";

interface Props {
  open: boolean;
  selectedKeys: string[];
  date: string;
  type: string;
  note: string;
  submitting: boolean;
  onChangeDate: (v: string) => void;
  onChangeType: (v: string) => void;
  onChangeNote: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const SALES_TASK_TYPES = ["ย้ายเข้า", "ย้ายออก", "ชมห้อง"] as const;
const ENG_TASK_TYPES   = ["ทำสะอาด", "ซ่อม"] as const;
const COMMON_TASK_TYPES = ["อื่นๆ"] as const;

export default function BulkAddModal({
  open, selectedKeys, date, type, note, submitting,
  onChangeDate, onChangeType, onChangeNote, onClose, onSubmit,
}: Props) {
  const { data: session } = useSession();
  const role = session?.user?.role;

  const allowedTypes = useMemo(() => {
    const list: string[] = [];
    if (canAddSalesTask(role)) list.push(...SALES_TASK_TYPES);
    if (canAddEngTask(role))   list.push(...ENG_TASK_TYPES);
    list.push(...COMMON_TASK_TYPES);
    return list;
  }, [role]);

  // Default type ที่เหมาะกับ role — รีเซ็ตเมื่อ allowedTypes ไม่ครอบ type ปัจจุบัน
  useEffect(() => {
    if (!open) return;
    if (!allowedTypes.includes(type)) {
      // Bulk default คงเดิม "ทำสะอาด" สำหรับ engineer/management; "ชมห้อง" สำหรับ sales
      const fallback =
        role === "sales" ? "ชมห้อง"
        : role === "engineer" ? "ซ่อม"
        : "ทำสะอาด";
      onChangeType(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, role]);

  if (!open) return null;
  const count = selectedKeys.length;
  return (
    <div className="ac-modal-backdrop" onClick={() => !submitting && onClose()}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title">เพิ่มงานพร้อมกัน {count} ห้อง</div>
            <div className="ac-modal-sub">ระบบจะสร้าง 1 งาน/ห้อง</div>
          </div>
          <button className="ac-modal-close" onClick={() => !submitting && onClose()}>✕</button>
        </header>
        <div className="ac-modal-body">
          <div className="ac-field">
            <label>วันที่</label>
            <input type="date" value={date} onChange={(e) => onChangeDate(e.target.value)} />
          </div>
          <div className="ac-field">
            <label>ประเภท</label>
            <select value={type} onChange={(e) => onChangeType(e.target.value)}>
              {allowedTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="ac-field">
            <label>หมายเหตุ (เหมือนกันทุกงาน)</label>
            <textarea rows={2} value={note} onChange={(e) => onChangeNote(e.target.value)} />
          </div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            ห้อง: {selectedKeys.slice(0, 6).join(", ")}{count > 6 ? ` ... +${count - 6}` : ""}
          </div>
        </div>
        <footer className="ac-modal-foot">
          <button className="ac-btn ac-btn-ghost" disabled={submitting} onClick={onClose}>ยกเลิก</button>
          <button className="ac-btn ac-btn-primary" disabled={submitting} onClick={onSubmit}>
            {submitting ? `กำลังเพิ่ม...` : `เพิ่ม ${count} งาน`}
          </button>
        </footer>
      </div>
    </div>
  );
}
