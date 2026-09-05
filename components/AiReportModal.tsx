"use client";

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { toast } from "@/lib/toast";

/**
 * ✨ สรุปส่ง LINE (r31 — pattern daily_report): เอา digest ของช่วงที่เลือก
 * ให้ AI เขียนเป็นรายงานไทยอ่านลื่น → แก้ได้ → คัดลอกวาง LINE เจ้าของ.
 */

interface Props {
  open: boolean;
  periodLabel: string;
  digestMarkdown: string;
  onClose: () => void;
}

export default function AiReportModal({ open, periodLabel, digestMarkdown, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setText(""); setError(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/ai/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodLabel, digestMarkdown }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({ ok: false, error: "invalid JSON" }));
        if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
        return data.text as string;
      })
      .then((t) => { if (!cancelled) setText(t); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "สร้างรายงานไม่สำเร็จ"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, periodLabel, digestMarkdown]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("คัดลอกรายงานแล้ว ✓ — วางใน LINE ได้เลย");
    } catch {
      toast.error("คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความในกล่องแล้วคัดลอกเอง");
    }
  }

  return (
    <div className="ac-modal-backdrop" onClick={onClose}>
      <div ref={ref} className="ac-modal ac-modal-form ac-ai-report" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="สรุปรายงานส่ง LINE">
        <header className="ac-modal-head">
          <div className="ac-modal-title">✨ สรุปงาน{periodLabel} — ส่ง LINE</div>
          <button type="button" className="ac-modal-close" onClick={onClose} aria-label="ปิด">✕</button>
        </header>
        <div className="ac-modal-body">
          {loading && <div className="ac-ai-loading">⏳ กำลังเขียนรายงาน… (ราว 10 วินาที)</div>}
          {error && <div className="ac-banner ac-banner-warn" role="alert">⚠ {error}</div>}
          {!loading && !error && (
            <>
              <p className="ac-text-muted ac-ai-hint">AI เขียนจากข้อมูลในหน้านี้เท่านั้น — แก้ถ้อยคำได้ก่อนคัดลอก</p>
              <textarea
                className="ac-ai-report-text"
                rows={14}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="ข้อความรายงาน"
              />
            </>
          )}
        </div>
        <footer className="ac-modal-foot">
          <button className="ac-btn ac-btn-ghost" onClick={onClose}>ปิด</button>
          <button className="ac-btn ac-btn-primary" onClick={() => void copy()} disabled={loading || !text}>
            📋 คัดลอกไปวาง LINE
          </button>
        </footer>
      </div>
    </div>
  );
}
