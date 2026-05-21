"use client";

import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import type { Role } from "@/auth";
import { canAddSalesTask, canAddEngTask } from "@/lib/permissions";
import { useFocusTrap } from "@/lib/useFocusTrap";
import {
  BUILDINGS,
  makeTaskSchema,
  type TaskFormValues,
  type RoomRef,
} from "@/lib/taskSchema";
import {
  getRoomPlaceholder,
  getCostPlaceholder,
  getRoomHint,
} from "@/lib/buildingPlaceholders";

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

function defaultTypeFor(
  roles: Role[] | undefined,
  current: string,
  preferred?: string,
): TaskFormValues["type"] {
  // multi-role: keep current if still allowed; otherwise pick default
  const list = roles || [];
  const canSales = list.includes("sales") || list.includes("management");
  const canEng   = list.includes("engineer") || list.includes("management");
  if (canSales && SALES_TASK_TYPES.includes(current as never)) return current as TaskFormValues["type"];
  if (canEng && ENG_TASK_TYPES.includes(current as never)) return current as TaskFormValues["type"];
  if (preferred) {
    if (canSales && SALES_TASK_TYPES.includes(preferred as never)) return preferred as TaskFormValues["type"];
    if (canEng   && ENG_TASK_TYPES.includes(preferred as never))   return preferred as TaskFormValues["type"];
  }
  if (canSales) return "ชมห้อง";
  if (canEng)   return "ซ่อม";
  return "ย้ายเข้า";
}

interface Props {
  open: boolean;
  saving: boolean;
  buildings: string[]; // ใช้ list ที่ parent ส่งให้ (อาจ subset ของ BUILDINGS)
  /** Initial values when opening — Partial so parent can pre-fill some fields
      (e.g. building+room from openAddTaskForRoom) without supplying all. */
  initialValues?: Partial<TaskFormValues>;
  /** Known rooms for cross-field "ห้องนี้มีในตึก" validation */
  rooms?: RoomRef[];
  /** Mode-specific preferred default type */
  defaultType?: string;
  onClose: () => void;
  /** Called with validated form values when user submits successfully */
  onSubmit: (values: TaskFormValues) => Promise<void> | void;
}

/** Sensible defaults so RHF defaultValues satisfies the schema shape. */
function buildDefaults(partial: Partial<TaskFormValues> | undefined): TaskFormValues {
  return {
    date: partial?.date || new Date().toISOString().slice(0, 10),
    type: (partial?.type as TaskFormValues["type"]) || "ย้ายเข้า",
    building: (partial?.building as TaskFormValues["building"]) || ("" as TaskFormValues["building"]),
    room: partial?.room || "",
    customer: partial?.customer || "",
    phone: partial?.phone || "",
    note: partial?.note || "",
    cost: partial?.cost || "",
  };
}

export default function AddTaskModal({
  open, saving, buildings, initialValues, rooms, defaultType,
  onClose, onSubmit,
}: Props) {
  const { data: session } = useSession();
  const roles = session?.user?.roles;

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, dialogRef);

  // Schema with current rooms list — falls back to base schema when rooms
  // not yet loaded (avoid blocking submit on transient empty state).
  const schema = useMemo(() => makeTaskSchema(rooms || []), [rooms]);

  const defaults = useMemo(() => buildDefaults(initialValues), [initialValues]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setFocus,
    formState: { errors, isSubmitting, isValid },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    // Validate on blur — feels natural (no screaming red on fresh fields)
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  // ประเภทที่ role อนุญาตให้สร้าง
  const allowedTypes = useMemo(() => {
    const list: string[] = [];
    if (canAddSalesTask(roles)) list.push(...SALES_TASK_TYPES);
    if (canAddEngTask(roles))   list.push(...ENG_TASK_TYPES);
    list.push(...COMMON_TASK_TYPES);
    return list;
  }, [roles]);

  const currentType = watch("type");
  const showCustomerSection = TYPES_WITH_CUSTOMER.has(currentType);

  // Building-aware placeholders — adapt to the selected building's naming
  // convention (e.g. ตึกมีทรัพย์ uses "1.1, 1.2") and price band (median).
  const currentBuilding = watch("building");
  const roomPlaceholder = useMemo(
    () => getRoomPlaceholder(rooms || [], currentBuilding),
    [rooms, currentBuilding],
  );
  const costPlaceholder = useMemo(
    () => getCostPlaceholder(rooms || [], currentBuilding),
    [rooms, currentBuilding],
  );
  const roomHint = useMemo(
    () => getRoomHint(rooms || [], currentBuilding),
    [rooms, currentBuilding],
  );

  // Reset form to fresh initialValues when modal opens (handles "open
  // again with different prefill" scenarios like openAddTaskForRoom).
  useEffect(() => {
    if (!open) return;
    reset(defaults);
    const t = setTimeout(() => setFocus("date"), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  // Coerce type to allowed value when role mix changes
  useEffect(() => {
    if (!open) return;
    if (!allowedTypes.includes(currentType)) {
      const next = defaultTypeFor(roles, currentType, defaultType);
      reset({ ...defaults, type: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roles, allowedTypes]);

  // Esc to close, Cmd/Ctrl+Enter to submit
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!saving && !isSubmitting) onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit(onSubmit)();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, isSubmitting, handleSubmit, onSubmit, onClose]);

  if (!open) return null;
  const busy = saving || isSubmitting;

  return (
    <div className="ac-modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        ref={dialogRef}
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
          <button className="ac-modal-close" onClick={onClose} aria-label="ปิด" type="button">✕</button>
        </header>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="ac-modal-body">
            {/* SECTION 1 — เมื่อไหร่ + ทำอะไร */}
            <div className="ac-form-section">
              <div className="ac-form-section-label">เมื่อไหร่ · ทำอะไร</div>
              <div className="ac-form-row">
                <div className={`ac-field ${errors.date ? "has-error" : ""}`}>
                  <label htmlFor="ac-addtask-date">
                    วันที่ <span className="ac-required" aria-hidden>*</span>
                  </label>
                  <input
                    id="ac-addtask-date"
                    type="date"
                    aria-invalid={!!errors.date}
                    aria-describedby={errors.date ? "err-date" : undefined}
                    {...register("date")}
                  />
                  {errors.date && (
                    <span className="ac-field-error" id="err-date">{errors.date.message}</span>
                  )}
                </div>
                <div className={`ac-field ${errors.type ? "has-error" : ""}`}>
                  <label htmlFor="ac-addtask-type">
                    ประเภท <span className="ac-required" aria-hidden>*</span>
                  </label>
                  <select
                    id="ac-addtask-type"
                    aria-invalid={!!errors.type}
                    {...register("type")}
                  >
                    {allowedTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {errors.type && (
                    <span className="ac-field-error">{errors.type.message}</span>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 2 — ที่ไหน */}
            <div className="ac-form-section">
              <div className="ac-form-section-label">ที่ไหน</div>
              <div className="ac-form-row">
                <div className={`ac-field ${errors.building ? "has-error" : ""}`}>
                  <label htmlFor="ac-addtask-building">
                    ตึก <span className="ac-required" aria-hidden>*</span>
                  </label>
                  <select
                    id="ac-addtask-building"
                    aria-invalid={!!errors.building}
                    {...register("building")}
                  >
                    <option value="">— เลือกตึก —</option>
                    {buildings.filter((b) => b !== "ทั้งหมด").map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  {errors.building && (
                    <span className="ac-field-error">{errors.building.message}</span>
                  )}
                </div>
                <div className={`ac-field ${errors.room ? "has-error" : ""}`}>
                  <label htmlFor="ac-addtask-room">
                    เลขห้อง <span className="ac-required" aria-hidden>*</span>
                  </label>
                  <input
                    id="ac-addtask-room"
                    type="text"
                    placeholder={roomPlaceholder}
                    aria-invalid={!!errors.room}
                    {...register("room")}
                  />
                  {errors.room ? (
                    <span className="ac-field-error">{errors.room.message}</span>
                  ) : roomHint ? (
                    <span className="ac-field-hint">{roomHint}</span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* SECTION 3 — ผู้ติดต่อ */}
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
                    {...register("customer")}
                  />
                </div>
                <div className="ac-field">
                  <label htmlFor="ac-addtask-phone">เบอร์โทร</label>
                  <input
                    id="ac-addtask-phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="08x-xxx-xxxx"
                    {...register("phone")}
                  />
                </div>
              </div>
            )}

            {/* SECTION 4 — ค่าใช้จ่าย + หมายเหตุ */}
            <div className="ac-form-section">
              <div className="ac-form-section-label">
                ค่าใช้จ่าย · หมายเหตุ <span className="ac-form-section-optional">(ไม่บังคับ)</span>
              </div>
              <div className="ac-field">
                <label htmlFor="ac-addtask-cost">ค่าใช้จ่าย (บาท)</label>
                <input
                  id="ac-addtask-cost"
                  type="text"
                  inputMode="numeric"
                  placeholder={costPlaceholder}
                  {...register("cost")}
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
                  placeholder="รายละเอียดเพิ่มเติม เช่น เวลานัด, ข้อจำกัด..."
                  {...register("note")}
                />
                {errors.note && (
                  <span className="ac-field-error">{errors.note.message}</span>
                )}
              </div>
            </div>
          </div>

          <footer className="ac-modal-foot ac-modal-foot-sticky">
            <span className="ac-modal-foot-hint" aria-hidden>
              <kbd>⌘</kbd>+<kbd>↵</kbd> บันทึก · <kbd>esc</kbd> ปิด
            </span>
            <button
              type="button"
              className="ac-btn ac-btn-ghost"
              onClick={onClose}
              disabled={busy}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="ac-btn ac-btn-primary"
              disabled={busy || !isValid}
            >
              {busy && <span className="ac-btn-spinner" aria-hidden />}
              {busy ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
