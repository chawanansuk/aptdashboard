"use client";

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

export default function BulkAddModal({
  open, selectedKeys, date, type, note, submitting,
  onChangeDate, onChangeType, onChangeNote, onClose, onSubmit,
}: Props) {
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
              <option>ทำสะอาด</option>
              <option>ย้ายเข้า</option>
              <option>ย้ายออก</option>
              <option>ชมห้อง</option>
              <option>ซ่อม</option>
              <option>อื่นๆ</option>
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
