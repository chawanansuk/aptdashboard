"use client";

import { useEffect, useRef, useState } from "react";
import type { Part, Requisition } from "@/types";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { relativeTimeLabel } from "@/lib/relativeTime";

/**
 * Lazy-loaded "ประวัติการเบิก" modal for a single part — fetches
 * /api/part-requisitions?partId=X on open, shows newest-first list
 * with who/when/where/quantity/note.
 *
 * Read-only; deletions/edits not supported (audit-style log).
 */

interface Props {
  open: boolean;
  part: Part | null;
  onClose: () => void;
}

export default function RequisitionHistoryModal({ open, part, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);

  const [rows, setRows] = useState<Requisition[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !part) {
      setRows(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    setRows(null);
    setErr(null);
    fetch(`/api/part-requisitions?partId=${encodeURIComponent(part.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.ok === false) {
          setErr(data.error || "โหลดประวัติไม่สำเร็จ");
          setRows([]);
        } else {
          setRows((data?.rows || []) as Requisition[]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErr("โหลดประวัติไม่สำเร็จ");
          setRows([]);
        }
      });
    return () => { cancelled = true; };
  }, [open, part]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !part) return null;

  return (
    <div className="ac-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={ref}
        className="ac-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-reqhist-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ac-modal-head">
          <h2 id="ac-reqhist-modal-title">ประวัติเบิก: {part.name}</h2>
          <button
            type="button"
            className="ac-modal-close"
            onClick={onClose}
            aria-label="ปิด"
          >×</button>
        </header>

        <div className="ac-modal-body">
          {err && <div className="ac-form-error" role="alert">{err}</div>}
          {rows === null ? (
            <div className="ac-req-history-empty">กำลังโหลด…</div>
          ) : rows.length === 0 ? (
            <div className="ac-req-history-empty">ยังไม่มีการเบิกอะไหล่ชิ้นนี้</div>
          ) : (
            <ul className="ac-req-history-list">
              {/* Newest first (audit r9 bug #2): the sheet appends rows
                  oldest-first and the server echoes that order — sort
                  here so the latest withdrawal tops the list. */}
              {[...rows].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).map((r) => (
                <li key={r.id} className="ac-req-history-item">
                  <div className="ac-req-history-row1">
                    <span className="ac-req-history-qty">×{r.quantity}</span>
                    <span className="ac-req-history-loc">
                      {r.building && r.room
                        ? `${r.building} · ห้อง ${r.room}`
                        : r.building || r.room || "ไม่ระบุห้อง"}
                    </span>
                    <span className="ac-req-history-time" title={r.createdAt}>
                      {relativeTimeLabel(r.createdAt) || r.createdAt}
                    </span>
                  </div>
                  <div className="ac-req-history-row2">
                    <span className="ac-req-history-user">
                      👤 {r.user.split("@")[0] || "—"}
                    </span>
                    {r.note && (
                      <span className="ac-req-history-note">· {r.note}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
