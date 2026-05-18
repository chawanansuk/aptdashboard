"use client";

import { useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import type { Role } from "@/auth";
import { canAddSalesTask, canAddEngTask } from "@/lib/permissions";

interface Props {
  open: boolean;
  saving: boolean;
  buildings: string[];
  date: string;
  type: string;
  building: string;
  room: string;
  customer: string;
  phone: string;
  note: string;
  onChange: (patch: Partial<{
    date: string; type: string; building: string; room: string;
    customer: string; phone: string; note: string;
  }>) => void;
  onClose: () => void;
  onSubmit: () => void;
}

/**
 * Task types ที่แต่ละ role เพิ่มได้:
 *   sales:      ย้ายเข้า / ย้ายออก / ชมห้อง / อื่นๆ
 *   engineer:   ทำสะอาด / ซ่อม / อื่นๆ
 *   management: ทุกอย่าง
 */
const SALES_TASK_TYPES = ["ย้ายเข้า", "ย้ายออก", "ชมห้อง"] as const;
const ENG_TASK_TYPES   = ["ทำสะอาด", "ซ่อม"] as const;
const COMMON_TASK_TYPES = ["อื่นๆ"] as const;

function defaultTypeFor(roles: Role[] | undefined, current: string): string {
  // multi-role: keep current if still allowed; otherwise pick default
  // that matches the user's "primary" focus (sales first, then engineer)
  const list = roles || [];
  const canSales = list.includes("sales") || list.includes("management");
  const canEng   = list.includes("engineer") || list.includes("management");
  if (canSales && SALES_TASK_TYPES.includes(current as never)) return current;
  if (canEng && ENG_TASK_TYPES.includes(current as never)) return current;
  if (canSales) return "ชมห้อง";
  if (canEng)   return "ซ่อม";
  return current || "ย้ายเข้า";
}

export default function AddTaskModal({
  open, saving, buildings, date, type, building, room, customer, phone, note,
  onChange, onClose, onSubmit,
}: Props) {
  const { data: session } = useSession();
  const roles = session?.user?.roles;

  // เลือกประเภทที่ role อนุญาต
  const allowedTypes = useMemo(() => {
    const list: string[] = [];
    if (canAddSalesTask(roles)) list.push(...SALES_TASK_TYPES);
    if (canAddEngTask(roles))   list.push(...ENG_TASK_TYPES);
    list.push(...COMMON_TASK_TYPES);
    return list;
  }, [roles]);

  // ถ้า type ปัจจุบันไม่อยู่ใน allowedTypes (เช่น เปิด modal โดยที่ default เก่า)
  // → reset เป็นค่าเริ่มต้นที่เหมาะกับ role
  useEffect(() => {
    if (!open) return;
    if (!allowedTypes.includes(type)) {
      onChange({ type: defaultTypeFor(roles, type) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roles]);

  if (!open) return null;
  return (
    <div className="ac-modal-backdrop" onClick={onClose}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title">เพิ่มงานใหม่</div>
            <div className="ac-modal-sub">บันทึกลงชีต &quot;งาน&quot;</div>
          </div>
          <button className="ac-modal-close" onClick={onClose}>✕</button>
        </header>
        <div className="ac-modal-body">
          <div className="ac-field">
            <label>วันที่</label>
            <input type="date" value={date} onChange={(e) => onChange({ date: e.target.value })} />
          </div>
          <div className="ac-field">
            <label>ประเภท</label>
            <select value={type} onChange={(e) => onChange({ type: e.target.value })}>
              {allowedTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="ac-field">
            <label>ตึก</label>
            <select value={building} onChange={(e) => onChange({ building: e.target.value })}>
              <option value="">— เลือกตึก —</option>
              {buildings.map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
          </div>
          <div className="ac-field">
            <label>เลขห้อง</label>
            <input type="text" value={room} onChange={(e) => onChange({ room: e.target.value })} placeholder="เช่น 101" />
          </div>
          <div className="ac-field">
            <label>ลูกค้า</label>
            <input type="text" value={customer} onChange={(e) => onChange({ customer: e.target.value })} />
          </div>
          <div className="ac-field">
            <label>เบอร์</label>
            <input type="tel" value={phone} onChange={(e) => onChange({ phone: e.target.value })} />
          </div>
          <div className="ac-field">
            <label>หมายเหตุ</label>
            <textarea rows={2} value={note} onChange={(e) => onChange({ note: e.target.value })} />
          </div>
        </div>
        <footer className="ac-modal-foot">
          <button className="ac-btn ac-btn-ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button className="ac-btn ac-btn-primary" onClick={onSubmit} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
        </footer>
      </div>
    </div>
  );
}
