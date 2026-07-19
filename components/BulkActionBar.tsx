"use client";

import { useState } from "react";
import { RAW_STATUS_OPTIONS, STATUS_DOT } from "@/lib/constants";
import { normalizeRoomStatus } from "@/lib/roomStatus";

interface Props {
  count: number;
  onClear: () => void;
  onAdd: () => void;
  onExit: () => void;
  /** When provided (room.editStatus), shows the bulk status changer. */
  onSetStatus?: (rawStatus: string) => void | Promise<void>;
  /** True while a bulk status write is in flight — disables the bar. */
  statusBusy?: boolean;
}

export default function BulkActionBar({
  count, onClear, onAdd, onExit, onSetStatus, statusBusy,
}: Props) {
  // Second stage: reveal the status chips in place of the action row.
  const [picking, setPicking] = useState(false);

  return (
    <div className="ac-bulk-bar">
      <div className="ac-bulk-info">
        <strong>{count}</strong> ห้องถูกเลือก
      </div>
      {picking && onSetStatus ? (
        <div className="ac-bulk-actions ac-bulk-status-row">
          {RAW_STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="ac-btn ac-btn-ghost ac-bulk-status-chip"
              disabled={count === 0 || statusBusy}
              onClick={async () => { await onSetStatus(s); setPicking(false); }}
              title={`เปลี่ยน ${count} ห้องเป็น "${s}"`}
            >
              <span className="ac-bulk-status-dot" style={{ background: STATUS_DOT[normalizeRoomStatus(s)] }} aria-hidden />
              {s}
            </button>
          ))}
          <button className="ac-btn ac-btn-ghost" onClick={() => setPicking(false)} disabled={statusBusy}>‹ กลับ</button>
        </div>
      ) : (
        <div className="ac-bulk-actions">
          <button className="ac-btn ac-btn-ghost" onClick={onClear} disabled={count === 0 || statusBusy}>ล้าง</button>
          <button className="ac-btn ac-btn-primary" disabled={count === 0 || statusBusy} onClick={onAdd}>+ เพิ่มงานทั้งหมด</button>
          {onSetStatus && (
            <button
              className="ac-btn ac-btn-secondary"
              disabled={count === 0 || statusBusy}
              onClick={() => setPicking(true)}
            >{statusBusy ? "กำลังบันทึก…" : "↺ เปลี่ยนสถานะ"}</button>
          )}
          <button className="ac-btn ac-btn-ghost" onClick={onExit} disabled={statusBusy}>ออก</button>
        </div>
      )}
    </div>
  );
}
