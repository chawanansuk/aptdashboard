"use client";

import { useEffect, useRef, useState } from "react";
import type { Part, Purchase, Requisition } from "@/types";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { relativeTimeLabel } from "@/lib/relativeTime";

/**
 * Lazy-loaded "ประวัติ" modal for a single part — สองแท็บ (v3.28):
 *   เบิกออก: /api/part-requisitions?partId=X (who/when/where/quantity)
 *   ซื้อเข้า: /api/part-purchases?partId=X — ราคาที่จ่ายจริงต่อครั้ง
 *            พร้อม ▲▼ เทียบครั้งก่อน (เห็นเลยว่าต้นทุนขึ้นหรือลง)
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
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [tab, setTab] = useState<"req" | "buy">("req");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !part) {
      setRows(null);
      setPurchases(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    setRows(null);
    setPurchases(null);
    setErr(null);
    fetch(`/api/part-purchases?partId=${encodeURIComponent(part.id)}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        // 403/502 ไม่มี rows → เดิมกลายเป็น "ยังไม่มีบันทึกการซื้อ" (โกหก)
        if (!r.ok || !Array.isArray(data?.rows)) throw new Error(data?.error || `HTTP ${r.status}`);
        return data.rows as Purchase[];
      })
      .then((rows) => { if (!cancelled) setPurchases(rows); })
      .catch((e) => {
        if (!cancelled) {
          setPurchases([]);
          setErr(e instanceof Error ? e.message : "โหลดประวัติซื้อไม่สำเร็จ");
        }
      });
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
          <h2 id="ac-reqhist-modal-title">ประวัติ: {part.name}</h2>
          <button
            type="button"
            className="ac-modal-close"
            onClick={onClose}
            aria-label="ปิด"
          >×</button>
        </header>

        <div className="ac-modal-body">
          <div className="ac-chips" role="tablist" aria-label="เลือกประวัติ" style={{ marginBottom: 10 }}>
            <button type="button" role="tab" aria-selected={tab === "req"}
              className={`ac-chip ${tab === "req" ? "is-active" : ""}`}
              onClick={() => setTab("req")}>📤 เบิกออก</button>
            <button type="button" role="tab" aria-selected={tab === "buy"}
              className={`ac-chip ${tab === "buy" ? "is-active" : ""}`}
              onClick={() => setTab("buy")}>🛒 ซื้อเข้า{purchases && purchases.length > 0 ? ` (${purchases.length})` : ""}</button>
          </div>
          {tab === "buy" ? (
            purchases === null ? (
              <div className="ac-req-history-empty">กำลังโหลด…</div>
            ) : purchases.length === 0 ? (
              <div className="ac-req-history-empty">
                ยังไม่มีบันทึกการซื้อ — กดปุ่ม &quot;เติม&quot; ในตารางแล้วใส่ราคา
                ครั้งถัดไปจะเริ่มเห็นแนวโน้มต้นทุน
              </div>
            ) : (
              <ul className="ac-req-history-list">
                {purchases.map((r, i) => {
                  // แถวมาใหม่สุดก่อน — เทียบกับ "ครั้งก่อนหน้า" คือ index ถัดไป
                  const prev = purchases.slice(i + 1).find((x) => x.unitPrice > 0);
                  const pct = r.unitPrice > 0 && prev
                    ? Math.round(((r.unitPrice - prev.unitPrice) / prev.unitPrice) * 100)
                    : 0;
                  return (
                    <li key={r.id} className="ac-req-history-item">
                      <div className="ac-req-history-row1">
                        <span className="ac-req-history-qty">×{r.quantity}</span>
                        <span className="ac-req-history-loc">
                          {r.totalPrice > 0
                            ? `${r.totalPrice.toLocaleString("th-TH")} ฿ (${r.unitPrice.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ฿/หน่วย)`
                            : "ไม่ได้ระบุราคา"}
                          {pct !== 0 && (
                            <strong className={pct > 0 ? "ac-buy-up" : "ac-buy-down"}>
                              {" "}{pct > 0 ? `▲ +${pct}%` : `▼ ${pct}%`}
                            </strong>
                          )}
                        </span>
                        <span className="ac-req-history-time" title={r.createdAt}>{r.date}</span>
                      </div>
                      <div className="ac-req-history-row2">
                        <span className="ac-req-history-user">👤 {(r.creator || "").split("@")[0] || "—"}</span>
                        {r.store && <span className="ac-req-history-note">· 🏪 {r.store}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : err ? (
            <div className="ac-form-error" role="alert">{err}</div>
          ) : rows === null ? (
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
