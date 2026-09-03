"use client";

import { useEffect, useRef, useState } from "react";
import type { Part } from "@/types";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { bangkokTodayYmd } from "@/lib/dateUtils";
import { toast } from "@/lib/toast";

/**
 * บันทึกซื้อของเข้าสต๊อก (v3.28) — แทนปุ่ม "เติม" แบบเงียบเดิม:
 * จดจำนวน + ราคาที่จ่ายจริงครั้งนี้ + ร้าน เพื่อดูแนวโน้มต้นทุน
 * ("ทิชชู่แมคโครเดือนนี้แพงขึ้นไหม"). ราคาไม่บังคับ — ไม่มีบิลในมือ
 * ก็ยังเติมสต๊อกได้ แค่ครั้งนั้นไม่เข้ากราฟราคา.
 */

const STORE_CHIPS = ["แมคโคร", "โฮมโปร", "ไทวัสดุ", "โกลบอลเฮ้าส์"];

interface Props {
  open: boolean;
  part: Part | null;
  /** Prefill จำนวนจากช่อง quick-adjust ในตาราง (ถ้ากรอกไว้). */
  initialQty?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function PurchaseModal({ open, part, initialQty, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);

  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [store, setStore] = useState("");
  const [date, setDate] = useState(() => bangkokTodayYmd());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setQty(initialQty || "");
      setTotal("");
      setStore("");
      setDate(bangkokTodayYmd());
    }
  }, [open, initialQty]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  if (!open || !part) return null;

  const qtyNum = parseFloat(qty);
  const totalNum = parseFloat(total.replace(/,/g, ""));
  const validQty = Number.isFinite(qtyNum) && qtyNum > 0;
  const hasPrice = Number.isFinite(totalNum) && totalNum > 0;
  const unitPreview = validQty && hasPrice ? totalNum / qtyNum : 0;

  async function submit() {
    if (!validQty || !part) return;
    setSaving(true);
    try {
      const res = await fetch("/api/part-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          partId: part.id,
          quantity: qtyNum,
          ...(hasPrice ? { totalPrice: totalNum } : {}),
          store: store.trim(),
          date,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const r = (data.result ?? data) as { unitPrice?: number; prevUnitPrice?: number; newStock?: number };
      // บอกแนวโน้มทันทีตอนบันทึก — จุดที่คนซื้อยังจำราคาครั้งก่อนได้ลางๆ
      if (hasPrice && r.prevUnitPrice && r.unitPrice) {
        const diff = r.unitPrice - r.prevUnitPrice;
        const pct = Math.round((diff / r.prevUnitPrice) * 100);
        if (Math.abs(pct) >= 1) {
          toast.info(
            `${part.name}: ${r.unitPrice.toLocaleString("th-TH")} ฿/${part.unit} ` +
            (diff > 0 ? `▲ แพงขึ้น ${pct}%` : `▼ ถูกลง ${Math.abs(pct)}%`) +
            ` จากครั้งก่อน (${r.prevUnitPrice.toLocaleString("th-TH")} ฿)`
          );
        } else {
          toast.success(`บันทึกซื้อ ${part.name} แล้ว — ราคาเท่าครั้งก่อน`);
        }
      } else {
        toast.success(`บันทึกซื้อ ${part.name} แล้ว ✓`);
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ac-modal-backdrop" onClick={() => !saving && onClose()}>
      <div ref={ref} className="ac-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="บันทึกซื้อของเข้าสต๊อก">
        <header className="ac-modal-head">
          <div className="ac-modal-title">🛒 ซื้อเข้า — {part.name}</div>
          <button type="button" className="ac-modal-close" onClick={onClose} aria-label="ปิด">✕</button>
        </header>
        <div className="ac-modal-body">
          <div className="ac-field">
            <label htmlFor="pur-qty">จำนวนที่ซื้อ ({part.unit}) *</label>
            <input
              id="pur-qty" inputMode="decimal" value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="เช่น 12" autoFocus
            />
          </div>
          <div className="ac-field">
            <label htmlFor="pur-total">ราคารวมที่จ่าย (บาท — ไม่บังคับ แต่ใส่แล้วเห็นแนวโน้มต้นทุน)</label>
            <input
              id="pur-total" inputMode="decimal" value={total}
              onChange={(e) => setTotal(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="เช่น 258"
            />
            {unitPreview > 0 && (
              <span className="ac-field-hint">
                ≈ {unitPreview.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ฿/{part.unit}
                {part.price && part.price > 0 && (
                  <> — ครั้งก่อน {part.price.toLocaleString("th-TH")} ฿</>
                )}
              </span>
            )}
          </div>
          <div className="ac-field">
            <label htmlFor="pur-store">ร้าน (ไม่บังคับ)</label>
            <div className="ac-chips" style={{ marginBottom: 6 }}>
              {STORE_CHIPS.map((sName) => (
                <button
                  key={sName}
                  type="button"
                  className={`ac-chip ${store === sName ? "is-active" : ""}`}
                  onClick={() => setStore((cur) => (cur === sName ? "" : sName))}
                >{sName}</button>
              ))}
            </div>
            <input
              id="pur-store" value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="หรือพิมพ์ชื่อร้านเอง"
            />
          </div>
          <div className="ac-field">
            <label htmlFor="pur-date">วันที่ซื้อ</label>
            <input
              id="pur-date" type="date" value={date} max={bangkokTodayYmd()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <footer className="ac-modal-foot">
          <button className="ac-btn ac-btn-ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button
            className="ac-btn ac-btn-primary"
            onClick={() => void submit()}
            disabled={saving || !validQty}
            title={validQty ? undefined : "กรอกจำนวนก่อน"}
          >
            {saving ? "กำลังบันทึก…" : "บันทึกซื้อเข้า"}
          </button>
        </footer>
      </div>
    </div>
  );
}
