"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Part } from "@/types";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { compressImageFile, extractImageFiles } from "@/lib/roomPhotos";
import { bestMatch, unitPriceOf, type ReceiptItem, type ReceiptScan } from "@/lib/receiptMatch";
import { bangkokTodayYmd } from "@/lib/dateUtils";
import { toast } from "@/lib/toast";

/**
 * 📷 สแกนใบเสร็จ (r28) — ถ่าย/เลือกรูปบิลแมคโคร → Claude อ่านรายการ →
 * จับคู่กับของในคลังให้ (แก้ได้) → กดบันทึกทีเดียว ลงบันทึกซื้อทุกบรรทัด
 * (บวกสต๊อก + จดราคา + อัปเดตราคา/หน่วย ผ่าน /api/part-purchases เดิม).
 *
 * หลักการ: ไม่มีอะไร commit อัตโนมัติ — ตารางตรวจสอบคือด่านสุดท้ายเสมอ
 * (AI อ่านเลขผิดได้ ผู้ใช้ต้องเห็นก่อน). บรรทัดที่จับคู่ไม่ได้เลือก "ข้าม"
 * เป็นค่าเริ่มต้น.
 */

interface Props {
  open: boolean;
  parts: Part[];
  onClose: () => void;
  /** เรียกหลังบันทึกสำเร็จอย่างน้อย 1 รายการ — ให้ PartsView รีโหลด */
  onSaved: () => void;
}

interface Line extends ReceiptItem {
  /** "" = ข้าม */
  partId: string;
  matchScore: number;
}

type Stage = "pick" | "scanning" | "review" | "saving";

export default function ReceiptScanModal({ open, parts, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [image, setImage] = useState<{ dataBase64: string; mimeType: string } | null>(null);
  const [scan, setScan] = useState<ReceiptScan | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [store, setStore] = useState("");
  const [date, setDate] = useState(() => bangkokTodayYmd());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStage("pick"); setPreview(null); setImage(null); setScan(null);
      setLines([]); setStore(""); setDate(bangkokTodayYmd()); setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && stage !== "scanning" && stage !== "saving") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, stage]);

  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const partOptions = useMemo(
    () => [...parts].sort((a, b) => a.name.localeCompare(b.name, "th")),
    [parts],
  );

  async function pickFile(files: File[]) {
    const f = files[0];
    if (!f) return;
    setError(null);
    try {
      const compressed = await compressImageFile(f);
      setImage(compressed);
      setPreview(`data:${compressed.mimeType};base64,${compressed.dataBase64}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านไฟล์รูปไม่สำเร็จ");
    }
  }

  async function runScan() {
    if (!image) return;
    setStage("scanning");
    setError(null);
    try {
      const res = await fetch("/api/receipt-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: image.dataBase64, mimeType: image.mimeType }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const s = data.scan as ReceiptScan;
      setScan(s);
      setStore(s.store || "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.date <= bangkokTodayYmd()) setDate(s.date);
      setLines(s.items.map((it) => {
        const m = bestMatch(it, parts);
        return { ...it, partId: m?.partId ?? "", matchScore: m?.score ?? 0 };
      }));
      setStage("review");
      if (s.items.length === 0) setError("ไม่พบรายการสินค้าในรูป — ลองถ่ายใหม่ให้เห็นทั้งใบชัดๆ");
    } catch (e) {
      setStage("pick");
      setError(e instanceof Error ? e.message : "อ่านใบเสร็จไม่สำเร็จ");
    }
  }

  const toSave = lines.filter((l) => l.partId && l.quantity > 0);

  async function saveAll() {
    if (toSave.length === 0) return;
    setStage("saving");
    let okCount = 0;
    const failed: string[] = [];
    for (const l of toSave) {
      try {
        const res = await fetch("/api/part-purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add",
            partId: l.partId,
            quantity: l.quantity,
            ...(l.totalPrice > 0 ? { totalPrice: l.totalPrice } : {}),
            store: store.trim(),
            date,
          }),
        });
        const data = await res.json().catch(() => ({ ok: false }));
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        okCount++;
      } catch (e) {
        failed.push(`${partById.get(l.partId)?.name || l.name}: ${e instanceof Error ? e.message : "พัง"}`);
      }
    }
    if (okCount > 0) onSaved();
    if (failed.length === 0) {
      toast.success(`บันทึกซื้อจากใบเสร็จแล้ว ${okCount} รายการ ✓`);
      onClose();
    } else {
      toast.warning(`บันทึกได้ ${okCount}/${toSave.length} รายการ`, {
        description: failed.join(" · "),
        duration: 12000,
      });
      // เก็บเฉพาะบรรทัดที่พังไว้ให้ลองใหม่
      setLines((cur) => cur.filter((l) => !l.partId || failed.some((f) => f.startsWith(partById.get(l.partId)?.name || l.name))));
      setStage("review");
    }
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((cur) => cur.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  if (!open) return null;

  const sumLines = lines.reduce((s, l) => s + (l.totalPrice || 0), 0);

  return (
    <div className="ac-modal-backdrop" onClick={() => stage !== "scanning" && stage !== "saving" && onClose()}>
      <div ref={ref} className="ac-modal ac-modal-form ac-receipt-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="สแกนใบเสร็จ">
        <header className="ac-modal-head">
          <div className="ac-modal-title">📷 สแกนใบเสร็จ → บันทึกซื้อ</div>
          <button type="button" className="ac-modal-close" onClick={onClose} aria-label="ปิด" disabled={stage === "scanning" || stage === "saving"}>✕</button>
        </header>

        <div className="ac-modal-body">
          {error && <div className="ac-banner ac-banner-warn" role="alert">⚠ {error}</div>}

          {(stage === "pick" || stage === "scanning") && (
            <>
              <div
                className={`ac-receipt-drop ${preview ? "has-image" : ""}`}
                onClick={() => !preview && fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); void pickFile(extractImageFiles(e.dataTransfer)); }}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="ใบเสร็จ" className="ac-receipt-preview" />
                ) : (
                  <div className="ac-receipt-drop-hint">
                    <div style={{ fontSize: 40 }}>🧾</div>
                    <strong>ถ่ายรูป / เลือกรูปใบเสร็จ</strong>
                    <span className="ac-text-muted">ให้เห็นทั้งใบ ชัด ไม่เอียงมาก — ระบบจะอ่านรายการ จำนวน ราคาให้เอง</span>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => void pickFile(Array.from(e.target.files || []))}
                />
              </div>
              {preview && stage === "pick" && (
                <div className="ac-chips">
                  <button type="button" className="ac-chip" onClick={() => fileRef.current?.click()}>เปลี่ยนรูป</button>
                </div>
              )}
              {stage === "scanning" && (
                <div className="ac-receipt-scanning">⏳ กำลังอ่านใบเสร็จ… (ราว 10-20 วินาที)</div>
              )}
            </>
          )}

          {(stage === "review" || stage === "saving") && scan && (
            <>
              <div className="ac-receipt-meta">
                <div className="ac-field">
                  <label htmlFor="rc-store">ร้าน</label>
                  <input id="rc-store" value={store} onChange={(e) => setStore(e.target.value)} placeholder="เช่น แมคโคร" />
                </div>
                <div className="ac-field">
                  <label htmlFor="rc-date">วันที่ซื้อ</label>
                  <input id="rc-date" type="date" value={date} max={bangkokTodayYmd()} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <p className="ac-text-muted ac-receipt-hint">
                ตรวจแล้วแก้ได้ทุกช่อง — บรรทัดที่ระบบเดาของในคลังไม่ถูก เลือกเองจากช่อง &quot;ของในคลัง&quot; หรือปล่อย &quot;ข้าม&quot;
                {scan.total > 0 && ` · ยอดท้ายบิล ${scan.total.toLocaleString("th-TH")} ฿`}
              </p>
              <div className="ac-table-wrap">
                <table className="ac-table ac-receipt-table">
                  <thead>
                    <tr>
                      <th>ในใบเสร็จ</th>
                      <th>ของในคลัง</th>
                      <th className="num">จำนวน</th>
                      <th className="num">ราคารวม</th>
                      <th className="num">฿/หน่วย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const part = partById.get(l.partId);
                      const unit = unitPriceOf(l);
                      return (
                        <tr key={i} className={l.partId ? "" : "is-skipped"}>
                          <td>
                            <div className="ac-receipt-name">{l.name}</div>
                            {l.partId && l.matchScore > 0 && l.matchScore < 0.9 && (
                              <div className="ac-receipt-guess">เดา {Math.round(l.matchScore * 100)}% — เช็คด้วย</div>
                            )}
                          </td>
                          <td>
                            <select
                              value={l.partId}
                              onChange={(e) => updateLine(i, { partId: e.target.value, matchScore: 1 })}
                              aria-label={`ของในคลังสำหรับ ${l.name}`}
                            >
                              <option value="">— ข้าม —</option>
                              {partOptions.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                              ))}
                            </select>
                          </td>
                          <td className="num">
                            <input
                              inputMode="decimal" className="ac-receipt-num" value={l.quantity}
                              onChange={(e) => updateLine(i, { quantity: parseFloat(e.target.value) || 0 })}
                              aria-label="จำนวน"
                            />
                            {part && <span className="ac-text-muted"> {part.unit}</span>}
                          </td>
                          <td className="num">
                            <input
                              inputMode="decimal" className="ac-receipt-num" value={l.totalPrice}
                              onChange={(e) => updateLine(i, { totalPrice: parseFloat(e.target.value) || 0 })}
                              aria-label="ราคารวม"
                            />
                          </td>
                          <td className="num">
                            {unit > 0 ? unit.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "—"}
                            {part?.price && unit > 0 && part.price > 0 && (
                              <span className={unit > part.price ? "ac-buy-up" : unit < part.price ? "ac-buy-down" : ""}>
                                {unit > part.price ? ` ▲${Math.round(((unit - part.price) / part.price) * 100)}%` : unit < part.price ? ` ▼${Math.round(((part.price - unit) / part.price) * 100)}%` : ""}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="ac-receipt-sum">
                รวมที่อ่านได้ {sumLines.toLocaleString("th-TH")} ฿ · จะบันทึก <strong>{toSave.length}</strong> รายการ
                {lines.length - toSave.length > 0 && ` (ข้าม ${lines.length - toSave.length})`}
              </div>
            </>
          )}
        </div>

        <footer className="ac-modal-foot">
          {stage === "review" && (
            <button className="ac-btn ac-btn-ghost" onClick={() => { setStage("pick"); setScan(null); setLines([]); }}>← สแกนใหม่</button>
          )}
          <button className="ac-btn ac-btn-ghost" onClick={onClose} disabled={stage === "scanning" || stage === "saving"}>ยกเลิก</button>
          {(stage === "pick" || stage === "scanning") ? (
            <button className="ac-btn ac-btn-primary" onClick={() => void runScan()} disabled={!image || stage === "scanning"}>
              {stage === "scanning" ? "กำลังอ่าน…" : "อ่านใบเสร็จ"}
            </button>
          ) : (
            <button className="ac-btn ac-btn-primary" onClick={() => void saveAll()} disabled={toSave.length === 0 || stage === "saving"}>
              {stage === "saving" ? "กำลังบันทึก…" : `บันทึกซื้อ ${toSave.length} รายการ`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
