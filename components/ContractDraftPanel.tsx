"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { toast } from "@/lib/toast";
import { contractFileName, isContractPilot, type ContractInput } from "@/lib/contractDraft";

/**
 * "ร่างสัญญา" inside the booking window (pilot buildings only).
 *
 * One tap turns the booking form into a PDF draft of the lease (wording =
 * the building's Google Doc, see /api/contract). On a phone "ส่งเข้า LINE"
 * opens the share sheet with the PDF attached; elsewhere it downloads.
 *
 * Safety:
 *  - a draft made from the system's SAMPLE wording can be opened but not
 *    sent — the owner has to rewrite the Doc first;
 *  - once the form changes, the draft is stale and has to be made again,
 *    so a customer never receives figures that differ from the booking.
 */

interface Props {
  building: string;
  /** Current booking form; null while required fields are missing. */
  input: ContractInput | null;
}

interface TemplateState {
  loading: boolean;
  exists: boolean;
  docUrl?: string;
  manage: boolean;
  error?: string;
}

interface DraftState {
  file: File;
  url: string;
  sample: boolean;
  /** The form as it was when this draft was made. */
  key: string;
}

const inputKey = (i: ContractInput | null) => (i ? JSON.stringify(i) : "");

export default function ContractDraftPanel({ building, input }: Props) {
  const pilot = isContractPilot(building);
  const [tpl, setTpl] = useState<TemplateState>({ loading: true, exists: false, manage: false });
  const [busy, setBusy] = useState<"" | "draft" | "create">("");
  const [draft, setDraft] = useState<DraftState | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pilot) return;
    let cancelled = false;
    fetch(`/api/contract?building=${encodeURIComponent(building)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelled) return;
        if (!r.ok || !j?.ok) { setTpl({ loading: false, exists: false, manage: false, error: j?.error || "เช็กแม่แบบไม่สำเร็จ" }); return; }
        setTpl({ loading: false, exists: !!j.template, docUrl: j.template?.docUrl, manage: !!j.manage });
      })
      .catch(() => { if (!cancelled) setTpl({ loading: false, exists: false, manage: false, error: "เช็กแม่แบบไม่สำเร็จ" }); });
    return () => { cancelled = true; };
  }, [pilot, building]);

  // Free the PDF held in memory when the window closes.
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  if (!pilot) return null;

  const stale = !!draft && draft.key !== inputKey(input);

  async function makeDraft() {
    if (!input) return;
    setBusy("draft");
    try {
      const res = await fetch("/api/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", ...input }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        if (j?.code === "no_template") setTpl((t) => ({ ...t, exists: false }));
        throw new Error(j?.error || `ทำร่างไม่สำเร็จ (${res.status})`);
      }
      const blob = await res.blob();
      const file = new File([blob], contractFileName(input), { type: "application/pdf" });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      const sample = res.headers.get("X-Contract-Sample") === "1";
      setDraft({ file, url, sample, key: inputKey(input) });
      if (sample) toast.warning("ได้ร่างจากข้อความตัวอย่าง — ยังห้ามส่งลูกค้า", { description: "ผู้จัดการต้องแก้แม่แบบใน Google Docs ก่อน" });
      else toast.success("ร่างสัญญาพร้อมส่งแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ทำร่างไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function createTemplate() {
    setBusy("create");
    try {
      const res = await fetch("/api/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createTemplate", building }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "สร้างแม่แบบไม่สำเร็จ");
      setTpl((t) => ({ ...t, exists: true, docUrl: j.docUrl }));
      toast.success("สร้างแม่แบบสัญญาแล้ว", { description: "เปิดแก้ถ้อยคำใน Google Docs ได้จากลิงก์ในหน้าต่างนี้" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างแม่แบบไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  function download(d: DraftState) {
    const a = document.createElement("a");
    a.href = d.url;
    a.download = d.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function share(d: DraftState) {
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [d.file] })) {
      try {
        await nav.share({ files: [d.file], title: d.file.name });
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") toast.error("ส่งไฟล์ไม่สำเร็จ — กดดาวน์โหลดแล้วแนบใน LINE เอง");
      }
      return;
    }
    download(d);
    toast.info("เครื่องนี้ส่งไฟล์เข้า LINE ตรงๆ ไม่ได้ — ดาวน์โหลดไฟล์ให้แล้ว แนบในแชท LINE ได้เลย");
  }

  return (
    <section className="ac-contract" aria-label="ร่างสัญญา">
      <div className="ac-contract-head">
        <span className="ac-contract-title"><Icon name="files" /> ร่างสัญญาให้ลูกค้าอ่าน</span>
        {tpl.manage && tpl.docUrl && (
          <a className="ac-contract-edit" href={tpl.docUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="edit" /> แก้ถ้อยคำ (Google Docs)
          </a>
        )}
      </div>

      {tpl.loading ? (
        <p className="ac-contract-hint">กำลังเช็กแม่แบบสัญญา…</p>
      ) : tpl.error ? (
        <p className="ac-contract-hint">{tpl.error}</p>
      ) : !tpl.exists ? (
        tpl.manage ? (
          <div className="ac-contract-row">
            <p className="ac-contract-hint">ตึกนี้ยังไม่มีแม่แบบสัญญา — สร้างแล้วระบบจะเปิด Google Docs ตัวอย่างให้แก้เป็นสัญญาจริงของหอ</p>
            <button type="button" className="ac-btn ac-btn-secondary" disabled={!!busy} onClick={() => void createTemplate()}>
              {busy === "create" ? "กำลังสร้าง…" : "สร้างแม่แบบสัญญา"}
            </button>
          </div>
        ) : (
          <p className="ac-contract-hint">ตึกนี้ยังไม่มีแม่แบบสัญญา — ให้ผู้จัดการกด &quot;สร้างแม่แบบสัญญา&quot; ก่อน</p>
        )
      ) : (
        <>
          <p className="ac-contract-hint">ทำ PDF จากข้อมูลในฟอร์มนี้ (ชื่อ ห้อง ค่าเช่า ประกัน วันเข้า) ลูกค้าอ่านก่อนวันเซ็นจริง</p>
          <div className="ac-contract-row">
            <button type="button" className="ac-btn ac-btn-secondary" disabled={!input || !!busy}
              title={!input ? "กรอกชื่อ เบอร์ ค่าเช่า และวันเข้าพักก่อน" : undefined}
              onClick={() => void makeDraft()}>
              {busy === "draft" ? <><span className="ac-btn-spinner" aria-hidden /> กำลังทำร่าง…</> : draft ? "ทำร่างใหม่" : "ทำร่างสัญญา (PDF)"}
            </button>
          </div>
          {busy === "draft" && <p className="ac-contract-hint">ใช้เวลาประมาณ 10 วินาที</p>}

          {draft && !stale && (
            <div className={`ac-contract-ready ${draft.sample ? "is-sample" : ""}`} role="status">
              {draft.sample ? (
                <p><Icon name="warning" /> ร่างนี้ใช้ข้อความ<b>ตัวอย่าง</b>ของระบบ — ห้ามส่งลูกค้าจริง จนกว่าผู้จัดการจะแก้แม่แบบใน Google Docs แล้วลบย่อหน้า [ตัวอย่าง-ยังไม่ได้ตรวจ]</p>
              ) : (
                <p><Icon name="check" /> {draft.file.name}</p>
              )}
              <div className="ac-contract-row">
                {!draft.sample && (
                  <button type="button" className="ac-btn ac-btn-primary" onClick={() => void share(draft)}>
                    ส่งเข้า LINE
                  </button>
                )}
                <a className="ac-btn ac-btn-ghost" href={draft.url} target="_blank" rel="noopener noreferrer">เปิดดู</a>
                <button type="button" className="ac-btn ac-btn-ghost" onClick={() => download(draft)}>
                  <Icon name="download" /> ดาวน์โหลด
                </button>
              </div>
            </div>
          )}
          {draft && stale && (
            <p className="ac-contract-hint ac-contract-stale">ข้อมูลในฟอร์มเปลี่ยนหลังทำร่าง — กด &quot;ทำร่างใหม่&quot; ก่อนส่ง</p>
          )}
        </>
      )}
    </section>
  );
}
