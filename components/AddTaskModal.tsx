"use client";

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

export default function AddTaskModal({
  open, saving, buildings, date, type, building, room, customer, phone, note,
  onChange, onClose, onSubmit,
}: Props) {
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
              <option>ย้ายเข้า</option>
              <option>ย้ายออก</option>
              <option>ชมห้อง</option>
              <option>ทำสะอาด</option>
              <option>ซ่อม</option>
              <option>อื่นๆ</option>
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
