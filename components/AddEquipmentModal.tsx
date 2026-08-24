"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EQUIPMENT_TYPES, EQUIPMENT_STATUS_LIST,
  INTERVAL_OPTIONS, DEFAULT_INTERVAL_DAYS,
} from "@/lib/constants";
import type { EquipmentType, EquipmentStatus } from "@/types";
import { modKey } from "@/lib/platform";

interface Props {
  open: boolean;
  building: string;
  room: string;
  submitting: boolean;
  /** ถ้ามี = edit mode (prefill); ถ้าไม่มี = add mode */
  initial?: {
    id: string;
    type: string;
    brand: string;
    installDate: string;
    lastService: string;
    status: string;
    note: string;
    intervalDays?: number;
  };
  onClose: () => void;
  onSubmit: (entry: {
    id?: string;
    type: EquipmentType;
    brand: string;
    installDate: string;
    lastService: string;
    status: EquipmentStatus;
    note: string;
    intervalDays: number;
  }) => void;
}

type FieldKey = "type" | "installDate";
type Errors = Partial<Record<FieldKey, string>>;

function validate(values: { type: string; installDate: string }): Errors {
  const e: Errors = {};
  if (!values.type) e.type = "เลือกประเภทอุปกรณ์";
  // installDate is recommended but not strictly required — allow empty
  // (some legacy equipment has no install date). If filled, must be valid.
  if (values.installDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.installDate)) {
    e.installDate = "รูปแบบวันที่ไม่ถูกต้อง";
  }
  return e;
}

export default function AddEquipmentModal({
  open, building, room, submitting, initial, onClose, onSubmit,
}: Props) {
  const isEdit = !!initial;
  const [type, setType] = useState<EquipmentType>(
    (initial?.type as EquipmentType) || "แอร์"
  );
  const [brand, setBrand] = useState(initial?.brand || "");
  const [installDate, setInstallDate] = useState(initial?.installDate || "");
  const [lastService, setLastService] = useState(initial?.lastService || "");
  const [status, setStatus] = useState<EquipmentStatus>(
    (initial?.status as EquipmentStatus) || "ปกติ"
  );
  const [note, setNote] = useState(initial?.note || "");
  const [intervalDays, setIntervalDays] = useState<number>(
    typeof initial?.intervalDays === "number"
      ? initial.intervalDays
      : (DEFAULT_INTERVAL_DAYS[(initial?.type as string) || "แอร์"] ?? 0)
  );

  // Validation state (local to modal)
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

  const errors = useMemo(() => validate({ type, installDate }), [type, installDate]);

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

  function handleTypeChange(t: EquipmentType) {
    setType(t);
    if (!isEdit) {
      setIntervalDays(DEFAULT_INTERVAL_DAYS[t] ?? 0);
    }
  }

  function attemptSubmit() {
    setSubmitAttempted(true);
    if (Object.keys(errors).length > 0) return;
    onSubmit({
      id: initial?.id,
      type,
      brand: brand.trim(),
      installDate,
      lastService,
      status,
      note: note.trim(),
      intervalDays,
    });
  }

  // Keyboard: Esc closes, Cmd/Ctrl+Enter submits
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
    ? "ระบบจะเตือนเมื่อใกล้ครบรอบ (นับจากวันซ่อมล่าสุด หรือวันติดตั้ง)"
    : "ไม่ติดตามรอบบำรุงสำหรับอุปกรณ์ชิ้นนี้";

  return (
    <div
      className="ac-modal-backdrop"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="ac-modal ac-modal-form"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-addeq-title"
      >
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title" id="ac-addeq-title">
              {isEdit ? "แก้ไขอุปกรณ์" : "เพิ่มอุปกรณ์"}
            </div>
            <div className="ac-modal-sub">{building} {room}</div>
          </div>
          <button
            className="ac-modal-close"
            onClick={() => !submitting && onClose()}
            aria-label="ปิด"
          >✕</button>
        </header>

        <div className="ac-modal-body">
          {/* SECTION 1 — ประเภท · ยี่ห้อ */}
          <div className="ac-form-section">
            <div className="ac-form-section-label">ประเภท · ยี่ห้อ</div>
            <div className="ac-form-row">
              <div className={`ac-field ${shouldShowError("type") ? "has-error" : ""}`}>
                <label htmlFor="ac-addeq-type">
                  ประเภท <span className="ac-required" aria-hidden>*</span>
                </label>
                <select
                  id="ac-addeq-type"
                  ref={firstFieldRef}
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value as EquipmentType)}
                  onBlur={() => markTouched("type")}
                  aria-invalid={shouldShowError("type") ? "true" : "false"}
                >
                  {EQUIPMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {shouldShowError("type") && (
                  <span className="ac-field-error">{errors.type}</span>
                )}
              </div>
              <div className="ac-field">
                <label htmlFor="ac-addeq-brand">ยี่ห้อ / รุ่น</label>
                <input
                  id="ac-addeq-brand"
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="เช่น Mitsubishi MS-SF18VC"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2 — ติดตั้ง */}
          <div className="ac-form-section">
            <div className="ac-form-section-label">
              ติดตั้ง <span className="ac-form-section-optional">(ไม่บังคับ)</span>
            </div>
            <div className="ac-form-row">
              <div className={`ac-field ${shouldShowError("installDate") ? "has-error" : ""}`}>
                <label htmlFor="ac-addeq-install">วันติดตั้ง</label>
                <input
                  id="ac-addeq-install"
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
                <label htmlFor="ac-addeq-lastservice">วันซ่อมล่าสุด</label>
                <input
                  id="ac-addeq-lastservice"
                  type="date"
                  value={lastService}
                  onChange={(e) => setLastService(e.target.value)}
                />
                <span className="ac-field-hint">เว้นว่างถ้ายังไม่เคยซ่อม</span>
              </div>
            </div>
          </div>

          {/* SECTION 3 — สถานะ · รอบบำรุง */}
          <div className="ac-form-section">
            <div className="ac-form-section-label">สถานะ · รอบบำรุง</div>
            <div className="ac-form-row">
              <div className="ac-field">
                <label htmlFor="ac-addeq-status">สถานะ</label>
                <select
                  id="ac-addeq-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EquipmentStatus)}
                >
                  {EQUIPMENT_STATUS_LIST.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="ac-field">
                <label htmlFor="ac-addeq-interval">รอบบำรุง</label>
                <select
                  id="ac-addeq-interval"
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(Number(e.target.value))}
                >
                  {INTERVAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
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
                placeholder="เช่น ติดตั้งใหม่ใน 5/2024, รับประกัน 2 ปี"
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
            disabled={submitting}
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
