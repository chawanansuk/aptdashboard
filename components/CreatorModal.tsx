"use client";

interface Props {
  open: boolean;
  hasCreator: boolean;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function CreatorModal({ open, hasCreator, value, onChange, onClose, onSave }: Props) {
  if (!open) return null;
  return (
    <div className="ac-modal-backdrop" onClick={onClose}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title">{hasCreator ? "แก้ไขชื่อผู้ใช้" : "ตั้งชื่อผู้ใช้"}</div>
            <div className="ac-modal-sub">ใช้บันทึกในชีตว่าใครเป็นคนเพิ่ม/แก้งาน</div>
          </div>
          <button className="ac-modal-close" onClick={onClose}>✕</button>
        </header>
        <div className="ac-modal-body">
          <div className="ac-field">
            <label>ชื่อ</label>
            <input
              type="text"
              autoFocus
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) onSave(); }}
              placeholder="เช่น สมชาย"
            />
          </div>
        </div>
        <footer className="ac-modal-foot">
          <button className="ac-btn ac-btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="ac-btn ac-btn-primary" onClick={onSave} disabled={!value.trim()}>บันทึก</button>
        </footer>
      </div>
    </div>
  );
}
