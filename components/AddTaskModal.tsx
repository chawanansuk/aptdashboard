"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { Role } from "@/auth";
import { canAddSalesTask, canAddEngTask } from "@/lib/permissions";

interface Props {
  open: boolean;
  saving: boolean;
  buildings: string[];
  date: string;
  type: string;
  building: string;
  room: string;
  customer: string;
  phone: string;
  note: string;
  /** v3.10.0 — optional cost (raw string input; parent owns it) */
  cost: string;
  onChange: (patch: Partial<{
    date: string; type: string; building: string; room: string;
    customer: string; phone: string; note: string; cost: string;
  }>) => void;
  onClose: () => void;
  onSubmit: () => void;
}

/**
 * Task types ที่แต่ละ role เพิ่มได้:
 *   sales:      ย้ายเข้า / ย้ายออก / ชมห้อง / อื่นๆ
 *   engineer:   ทำสะอาด / ซ่อม / อื่นๆ
 *   management: ทุกอย่าง
 */
const SALES_TASK_TYPES = ["ย้ายเข้า", "ย้ายออก", "ชมห้อง"] as const;
const ENG_TASK_TYPES   = ["ทำสะอาด", "ซ่อม"] as const;
const COMMON_TASK_TYPES = ["อื่นๆ"] as const;

/** Types where customer/phone are meaningful — clean = no customer. */
const TYPES_WITH_CUSTOMER = new Set(["ย้ายเข้า", "ย้ายออก", "ชมห้อง"]);

function defaultTypeFor(roles: Role[] | undefined, current: string): string {
  // multi-role: keep current if still allowed; otherwise pick default
  // that matches the user's "primary" focus (sales first, then engineer)
  const list = roles || [];
  const canSales = list.includes("sales") || list.includes("management");
  const canEng   = list.includes("engineer") || list.includes("management");
  if (canSales && SALES_TASK_TYPES.includes(current as never)) return current;
  if (canEng && ENG_TASK_TYPES.includes(current as never)) return current;
  if (canSales) return "ชมห้อง";
  if (canEng)   return "ซ่อม";
  return current || "ย้ายเข้า";
}

/* ====================================================================
 * Validation — pure, returns errors keyed by field name
 * ==================================================================== */
type FieldKey = "building" | "room" | "date" | "type";
type Errors = Partial<Record<FieldKey, string>>;

function validate(values: {
  date: string; type: string; building: string; room: string;
}): Errors {
  const e: Errors = {};
  if (!values.date) e.date = "กรอกวันที่";
  if (!values.type) e.type = "เลือกประเภทงาน";
  if (!values.building) e.building = "เลือกตึก";
  if (!values.room.trim()) e.room = "กรอกเลขห้อง";
  return e;
}

export default function AddTaskModal({
  open, saving, buildings, date, type, building, room, customer, phone, note, cost,
  onChange, onClose, onSubmit,
}: Props) {
  const { data: session } = useSession();
  const roles = session?.user?.roles;

  // Local UI state: errors shown only after a submit attempt or after a
  // field is blurred. This avoids "screaming red" on a fresh modal.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Reset validation flags when the modal opens/closes
  useEffect(() => {
    if (open) {
      setSubmitAttempted(false);
      setTouched(new Set());
      // Auto-focus the date field on open for fast keyboard entry
      const t = setTimeout(() => firstFieldRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // เลือกประเภทที่ role อนุญาต
  const allowedTypes = useMemo(() => {
    const list: string[] = [];
    if (canAddSalesTask(roles)) list.push(...SALES_TASK_TYPES);
    if (canAddEngTask(roles))   list.push(...ENG_TASK_TYPES);
    list.push(...COMMON_TASK_TYPES);
    return list;
  }, [roles]);

  // Reset type when role's allowed set changes
  useEffect(() => {
    if (!open) return;
    if (!allowedTypes.includes(type)) {
      onChange({ type: defaultTypeFor(roles, type) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roles]);

  const errors = useMemo(
    () => validate({ date, type, building, room }),
    [date, type, building, room]
  );
  const showCustomerSection = TYPES_WITH_CUSTOMER.has(type);

  // A field shows its error if (a) submit was attempted, or (b) the user
  // already touched (blurred) that specific field. Both feel natural.
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

  function attemptSubmit() {
    setSubmitAttempted(true);
    if (Object.keys(errors).length > 0) {
      // Focus the first invalid field
      const order: FieldKey[] = ["date", "type", "building", "room"];
      const firstBad = order.find((k) => errors[k]);
      if (firstBad === "room") {
        // room is the only text input; let parent handle focus by re-rendering
        const el = document.getElementById("ac-addtask-room") as HTMLInputElement | null;
        el?.focus();
      } else if (firstBad === "building") {
        const el = document.getElementById("ac-addtask-building") as HTMLSelectElement | null;
        el?.focus();
      }
      return;
    }
    onSubmit();
  }

  // Esc to close, Cmd/Ctrl+Enter to submit
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!saving) onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        attemptSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving, errors]);

  if (!open) return null;
  return (
    <div className="ac-modal-backdrop" onClick={() => !saving && onClose()}>
      <div
        className="ac-modal ac-modal-form"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-addtask-title"
      >
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title" id="ac-addtask-title">เพิ่มงานใหม่</div>
            <div className="ac-modal-sub">บันทึกลงชีต &quot;งาน&quot;</div>
          </div>
          <button className="ac-modal-close" onClick={onClose} aria-label="ปิด">✕</button>
        </header>

        <div className="ac-modal-body">
          {/* SECTION 1 — เมื่อไหร่ + ทำอะไร */}
          <div className="ac-form-section">
            <div className="ac-form-section-label">เมื่อไหร่ · ทำอะไร</div>
            <div className="ac-form-row">
              <div className={`ac-field ${shouldShowError("date") ? "has-error" : ""}`}>
                <label htmlFor="ac-addtask-date">
                  วันที่ <span className="ac-required" aria-hidden>*</span>
                </label>
                <input
                  id="ac-addtask-date"
                  ref={firstFieldRef}
                  type="date"
                  value={date}
                  onChange={(e) => onChange({ date: e.target.value })}
                  onBlur={() => markTouched("date")}
                  aria-invalid={shouldShowError("date") ? "true" : "false"}
                  aria-describedby={shouldShowError("date") ? "err-date" : undefined}
                />
                {shouldShowError("date") && (
                  <span className="ac-field-error" id="err-date">{errors.date}</span>
                )}
              </div>
              <div className={`ac-field ${shouldShowError("type") ? "has-error" : ""}`}>
                <label htmlFor="ac-addtask-type">
                  ประเภท <span className="ac-required" aria-hidden>*</span>
                </label>
                <select
                  id="ac-addtask-type"
                  value={type}
                  onChange={(e) => onChange({ type: e.target.value })}
                  onBlur={() => markTouched("type")}
                  aria-invalid={shouldShowError("type") ? "true" : "false"}
                >
                  {allowedTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {shouldShowError("type") && (
                  <span className="ac-field-error">{errors.type}</span>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2 — ที่ไหน */}
          <div className="ac-form-section">
            <div className="ac-form-section-label">ที่ไหน</div>
            <div className="ac-form-row">
              <div className={`ac-field ${shouldShowError("building") ? "has-error" : ""}`}>
                <label htmlFor="ac-addtask-building">
                  ตึก <span className="ac-required" aria-hidden>*</span>
                </label>
                <select
                  id="ac-addtask-building"
                  value={building}
                  onChange={(e) => onChange({ building: e.target.value })}
                  onBlur={() => markTouched("building")}
                  aria-invalid={shouldShowError("building") ? "true" : "false"}
                >
                  <option value="">— เลือกตึก —</option>
                  {buildings.map((b) => (<option key={b} value={b}>{b}</option>))}
                </select>
                {shouldShowError("building") && (
                  <span className="ac-field-error">{errors.building}</span>
                )}
              </div>
              <div className={`ac-field ${shouldShowError("room") ? "has-error" : ""}`}>
                <label htmlFor="ac-addtask-room">
                  เลขห้อง <span className="ac-required" aria-hidden>*</span>
                </label>
                <input
                  id="ac-addtask-room"
                  type="text"
                  value={room}
                  onChange={(e) => onChange({ room: e.target.value })}
                  onBlur={() => markTouched("room")}
                  placeholder="เช่น 101"
                  aria-invalid={shouldShowError("room") ? "true" : "false"}
                />
                {shouldShowError("room") && (
                  <span className="ac-field-error">{errors.room}</span>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3 — ผู้ติดต่อ (only for sales-side tasks where it makes sense) */}
          {showCustomerSection && (
            <div className="ac-form-section">
              <div className="ac-form-section-label">
                ผู้ติดต่อ <span className="ac-form-section-optional">(ไม่บังคับ)</span>
              </div>
              <div className="ac-field">
                <label htmlFor="ac-addtask-customer">ชื่อลูกค้า</label>
                <input
                  id="ac-addtask-customer"
                  type="text"
                  value={customer}
                  onChange={(e) => onChange({ customer: e.target.value })}
                />
              </div>
              <div className="ac-field">
                <label htmlFor="ac-addtask-phone">เบอร์โทร</label>
                <input
                  id="ac-addtask-phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => onChange({ phone: e.target.value })}
                  placeholder="08x-xxx-xxxx"
                />
              </div>
            </div>
          )}

          {/* SECTION 4 — ค่าใช้จ่าย + หมายเหตุ */}
          <div className="ac-form-section">
            <div className="ac-form-section-label">
              ค่าใช้จ่าย · หมายเหตุ{" "}
              <span className="ac-form-section-optional">(ไม่บังคับ)</span>
            </div>
            <div className="ac-field">
              <label htmlFor="ac-addtask-cost">ค่าใช้จ่าย (บาท)</label>
              <input
                id="ac-addtask-cost"
                type="text"
                inputMode="numeric"
                value={cost}
                onChange={(e) => onChange({ cost: e.target.value })}
                placeholder="เช่น 1500"
              />
              <span className="ac-field-hint">
                ใส่ตอนสร้าง หรือมาเพิ่มภายหลังตอนทำงานเสร็จก็ได้
              </span>
            </div>
            <div className="ac-field">
              <label htmlFor="ac-addtask-note">หมายเหตุ</label>
              <textarea
                id="ac-addtask-note"
                rows={2}
                value={note}
                onChange={(e) => onChange({ note: e.target.value })}
                placeholder="รายละเอียดเพิ่มเติม เช่น เวลานัด, ข้อจำกัด..."
              />
            </div>
          </div>
        </div>

        <footer className="ac-modal-foot ac-modal-foot-sticky">
          <span className="ac-modal-foot-hint" aria-hidden>
            <kbd>⌘</kbd>+<kbd>↵</kbd> บันทึก · <kbd>esc</kbd> ปิด
          </span>
          <button className="ac-btn ac-btn-ghost" onClick={onClose} disabled={saving}>
            ยกเลิก
          </button>
          <button
            className="ac-btn ac-btn-primary"
            onClick={attemptSubmit}
            disabled={saving}
          >
            {saving && <span className="ac-btn-spinner" aria-hidden />}
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </footer>
      </div>
    </div>
  );
}
