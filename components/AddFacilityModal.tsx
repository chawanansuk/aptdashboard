"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FACILITY_TYPES, FACILITY_STATUS_LIST,
  INTERVAL_OPTIONS, FACILITY_DEFAULT_INTERVAL_DAYS,
} from "@/lib/constants";
import type { FacilityType, FacilityStatus } from "@/types";
import { modKey } from "@/lib/platform";

interface Props {
  open: boolean;
  buildings: string[];
  submitting: boolean;
  /** ถ้ามี = edit mode (prefill); ถ้าไม่มี = add mode */
  initial?: {
    id: string;
    building: string;
    type: string;
    name: string;
    installDate: string;
    lastService: string;
    status: string;
    note: string;
    intervalDays?: number;
  };
  onClose: () => void;
  onSubmit: (entry: {
    id?: string;
    building: string;
    type: FacilityType;
    name: string;
    installDate: string;
    lastService: string;
    status: FacilityStatus;
    note: string;
    intervalDays: number;
  }) => void;
}

type FieldKey = "building" | "type" | "installDate";
type Errors = Partial<Record<FieldKey, string>>;

function validate(values: { building: string; type: string; installDate: string }): Errors {
  const e: Errors = {};
  if (!values.building) e.building = "เลือกตึก";
  if (!values.type) e.type = "เลือกประเภท";
  if (values.installDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.installDate)) {
    e.installDate = "รูปแบบวันที่ไม่ถูกต้อง";
  }
  return e;
}

export default function AddFacilityModal({
  open, buildings, submitting, initial, onClose, onSubmit,
}: Props) {
  const isEdit = !!initial;
  const [building, setBuilding] = useState(initial?.building || buildings[0] || "");
  const [type, setType] = useState<FacilityType>(
    (initial?.type as FacilityType) || "รอบล้างแอร์"
  );
  const [name, setName] = useState(initial?.name || "");
  const [installDate, setInstallDate] = useState(initial?.installDate || "");
  const [lastService, setLastService] = useState(initial?.lastService || "");
  const [status, setStatus] = useState<FacilityStatus>(
    (initial?.status as FacilityStatus) || "ใช้งานได้"
  );
  const [note, setNote] = useState(initial?.note || "");
  const [intervalDays, setIntervalDays] = useState<number>(
    typeof initial?.intervalDays === "number"
      ? initial.intervalDays
      : (FACILITY_DEFAULT_INTERVAL_DAYS[(initial?.type as string) || "รอบล้างแอร์"] ?? 0)
  );

  // Validation state
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (open) {
      setSubmitAttempted(false);
      setTouched(new Set());
      const t = setTimeout(() => firstFieldRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const errors = useMemo(
    () => validate({ building, type, installDate }),
    [building, type, installDate]
  );

  function shouldShowError(field: FieldKey): boolean {
    if (!errors[field]) return false;
    return submitAttempted || touched.has(field);
  }
  function markTouched(field: FieldKey) {
    setTouched((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  }

  function handleTypeChange(t: FacilityType) {
    setType(t);
    if (!isEdit) {
      setIntervalDays(FACILITY_DEFAULT_INTERVAL_DAYS[t] ?? 0);
    }
  }

  function attemptSubmit() {
    setSubmitAttempted(true);
    if (Object.keys(errors).length > 0) return;
    onSubmit({
      id: initial?.id,
      building,
      type,
      name: name.trim(),
      installDate,
      lastService,
      status,
      note: note.trim(),
      intervalDays,
    });
  }

  // Keyboard
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!submitting) onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        attemptSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting, errors]);

  if (!open) return null;

  const intervalHint = intervalDays > 0
    ? "ระบบจะเตือนเมื่อใกล้ครบรอบ (นับจากวันบริการล่าสุด หรือวันติดตั้ง)"
    : "ไม่ติดตามรอบบำรุงสำหรับสาธารณูปโภคชิ้นนี้";

  return (
    <div className="ac-modal-backdrop" onClick={() => !submitting && onClose()}>
      <div
        className="ac-modal ac-modal-form"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-addfac-title"
      >
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title" id="ac-addfac-title">
              {isEdit ? "แก้ไขสาธารณูปโภค" : "เพิ่มสาธารณูปโภค"}
            </div>
            <div className="ac-modal-sub">{building || "—"}</div>
          </div>
          <button
            className="ac-modal-close"
            onClick={() => !submitting && onClose()}
            aria-label="ปิด"
          >✕</button>
        </header>

        <div className="ac-modal-body">
          {/* SECTION 1 — ที่ตั้ง · ประเภท */}
          <div className="ac-form-section">
            <div className="ac-form-section-label">ที่ตั้ง · ประเภท</div>
            <div className="ac-form-row">
              <div className={`ac-field ${shouldShowError("building") ? "has-error" : ""}`}>
                <label htmlFor="ac-addfac-building">
                  ตึก <span className="ac-required" aria-hidden>*</span>
                </label>
                <select
                  id="ac-addfac-building"
                  ref={firstFieldRef}
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  onBlur={() => markTouched("building")}
                  disabled={isEdit}
                  aria-invalid={shouldShowError("building") ? "true" : "false"}
                >
                  {buildings.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                {isEdit ? (
                  <span className="ac-field-hint">ห้ามย้ายตึก (แก้ไขเท่านั้น)</span>
                ) : shouldShowError("building") ? (
                  <span className="ac-field-error">{errors.building}</span>
                ) : null}
              </div>
              <div className={`ac-field ${shouldShowError("type") ? "has-error" : ""}`}>
                <label htmlFor="ac-addfac-type">
                  ประเภท <span className="ac-required" aria-hidden>*</span>
                </label>
                <select
                  id="ac-addfac-type"
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value as FacilityType)}
                  onBlur={() => markTouched("type")}
                  aria-invalid={shouldShowError("type") ? "true" : "false"}
                >
                  {FACILITY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {shouldShowError("type") && (
                  <span className="ac-field-error">{errors.type}</span>
                )}
              </div>
            </div>
            <div className="ac-field">
              <label htmlFor="ac-addfac-name">ชื่อ / รุ่น</label>
              <input
                id="ac-addfac-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น แอร์ล็อบบี้ #1"
              />
            </div>
          </div>

          {/* SECTION 2 — ติดตั้ง · บริการ */}
          <div className="ac-form-section">
            <div className="ac-form-section-label">
              ติดตั้ง · บริการ <span className="ac-form-section-optional">(ไม่บังคับ)</span>
            </div>
            <div className="ac-form-row">
              <div className={`ac-field ${shouldShowError("installDate") ? "has-error" : ""}`}>
                <label htmlFor="ac-addfac-install">วันติดตั้ง</label>
                <input
                  id="ac-addfac-install"
                  type="date"
                  value={installDate}
                  onChange={(e) => setInstallDate(e.target.value)}
                  onBlur={() => markTouched("installDate")}
                  aria-invalid={shouldShowError("installDate") ? "true" : "false"}
                />
                {shouldShowError("installDate") && (
                  <span className="ac-field-error">{errors.installDate}</span>
                )}
              </div>
              <div className="ac-field">
                <label htmlFor="ac-addfac-lastservice">วันบริการล่าสุด</label>
                <input
                  id="ac-addfac-lastservice"
                  type="date"
                  value={lastService}
                  onChange={(e) => setLastService(e.target.value)}
                />
                <span className="ac-field-hint">เว้นว่างถ้ายังไม่เคยมีการบริการ</span>
              </div>
            </div>
          </div>

          {/* SECTION 3 — สถานะ · รอบบำรุง */}
          <div className="ac-form-section">
            <div className="ac-form-section-label">สถานะ · รอบบำรุง</div>
            <div className="ac-form-row">
              <div className="ac-field">
                <label htmlFor="ac-addfac-status">สถานะ</label>
                <select
                  id="ac-addfac-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as FacilityStatus)}
                >
                  {FACILITY_STATUS_LIST.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="ac-field">
                <label htmlFor="ac-addfac-interval">รอบบำรุง</label>
                <select
                  id="ac-addfac-interval"
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(Number(e.target.value))}
                >
                  {INTERVAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                  {/* ค่าที่พิมพ์เองในชีท (เช่น 45 วัน) ต้องยังมองเห็น —
                      เดิม select เงียบๆ โชว์ว่างทั้งที่ค่าจริงถูกส่ง (audit r16 #5) */}
                  {intervalDays > 0 && !INTERVAL_OPTIONS.some((o) => o.value === intervalDays) && (
                    <option value={intervalDays}>ทุก {intervalDays} วัน (กำหนดเอง)</option>
                  )}
                </select>
              </div>
            </div>
            <span className="ac-field-hint">{intervalHint}</span>
          </div>

          {/* SECTION 4 — หมายเหตุ */}
          <div className="ac-form-section">
            <div className="ac-form-section-label">
              หมายเหตุ <span className="ac-form-section-optional">(ไม่บังคับ)</span>
            </div>
            <div className="ac-field">
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น สัญญาบำรุงรักษากับ XYZ ถึง 12/2026"
              />
            </div>
          </div>
        </div>

        <footer className="ac-modal-foot ac-modal-foot-sticky">
          <span className="ac-modal-foot-hint" aria-hidden>
            <kbd>{modKey()}</kbd>+<kbd>↵</kbd> บันทึก · <kbd>esc</kbd> ปิด
          </span>
          <button
            className="ac-btn ac-btn-ghost"
            disabled={submitting}
            onClick={onClose}
          >ยกเลิก</button>
          <button
            className="ac-btn ac-btn-primary"
            disabled={submitting || !building}
            onClick={attemptSubmit}
          >
            {submitting && <span className="ac-btn-spinner" aria-hidden />}
            {submitting ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </footer>
      </div>
    </div>
  );
}
