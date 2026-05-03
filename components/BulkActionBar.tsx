"use client";

interface Props {
  count: number;
  onClear: () => void;
  onAdd: () => void;
  onExit: () => void;
}

export default function BulkActionBar({ count, onClear, onAdd, onExit }: Props) {
  return (
    <div className="ac-bulk-bar">
      <div className="ac-bulk-info">
        <strong>{count}</strong> ห้องถูกเลือก
      </div>
      <div className="ac-bulk-actions">
        <button className="ac-btn ac-btn-ghost" onClick={onClear} disabled={count === 0}>ล้าง</button>
        <button className="ac-btn ac-btn-primary" disabled={count === 0} onClick={onAdd}>+ เพิ่มงานทั้งหมด</button>
        <button className="ac-btn ac-btn-ghost" onClick={onExit}>ออก</button>
      </div>
    </div>
  );
}
