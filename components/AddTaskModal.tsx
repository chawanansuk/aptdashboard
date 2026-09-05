"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Part } from "@/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import type { Role } from "@/auth";
import { canAddSalesTask, canAddEngTask, canAddCleanTask } from "@/lib/permissions";
import { modKey } from "@/lib/platform";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { fileRequisitionLines } from "@/lib/partsRequisition";
import { FIELD_LABELS, type CleanParsedTask } from "@/lib/ai/taskParse";
import { toast } from "@/lib/toast";
import {
  makeTaskSchema,
  type TaskFormValues,
  type RoomRef,
} from "@/lib/taskSchema";
import {
  getRoomPlaceholder,
  getCostPlaceholder,
  getRoomHint,
} from "@/lib/buildingPlaceholders";
import {
  COMMON_AREA_PREFIX,
  COMMON_AREA_TYPES,
  formatCommonArea,
} from "@/lib/taskLocation";

/**
 * Task types ที่แต่ละ role เพิ่มได้:
 *   sales:      ย้ายเข้า / ย้ายออก / ชมห้อง / ทำสะอาด / อื่นๆ
 *   engineer:   ทำสะอาด / ซ่อม / อื่นๆ
 *   management: ทุกอย่าง
 * "ทำสะอาด" is split out from the engineer-only bucket so sales can
 * schedule the turnover clean after a move-out (ซ่อม stays engineer-only).
 */
const SALES_TASK_TYPES = ["ย้ายเข้า", "ย้ายออก", "ชมห้อง"] as const;
const CLEAN_TASK_TYPES = ["ทำสะอาด"] as const;
const ENG_TASK_TYPES   = ["ซ่อม"] as const;
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
  // "ทำสะอาด" is allowed for every staff role (sales + engineer + mgmt).
  const canClean = canSales || canEng;
  const isAllowed = (t: string) =>
    (canSales && SALES_TASK_TYPES.includes(t as never)) ||
    (canClean && CLEAN_TASK_TYPES.includes(t as never)) ||
    (canEng   && ENG_TASK_TYPES.includes(t as never));
  if (isAllowed(current)) return current as TaskFormValues["type"];
  if (preferred && isAllowed(preferred)) return preferred as TaskFormValues["type"];
  if (canSales) return "ชมห้อง";
  if (canEng)   return "ซ่อม";
  if (canClean) return "ทำสะอาด";
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

/** Local "today" as yyyy-MM-dd. NOT toISOString() — that's UTC, so a
 *  late-evening add in Asia/Bangkok would default to tomorrow (or an
 *  early-morning one to yesterday). */
function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Sensible defaults so RHF defaultValues satisfies the schema shape. */
function buildDefaults(partial: Partial<TaskFormValues> | undefined): TaskFormValues {
  return {
    date: partial?.date || localToday(),
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
    setValue,
    setFocus,
    formState: { errors, isSubmitting, isValid, isDirty },
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
    if (canAddCleanTask(roles)) list.push(...CLEAN_TASK_TYPES);
    if (canAddEngTask(roles))   list.push(...ENG_TASK_TYPES);
    list.push(...COMMON_TASK_TYPES);
    return list;
  }, [roles]);

  const currentType = watch("type");

  // ---- AI paste (r31) ----
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiUnsure, setAiUnsure] = useState<string[]>([]);
  async function runAiParse() {
    const text = aiText.trim();
    if (!text) return;
    setAiBusy(true);
    setAiUnsure([]);
    try {
      const res = await fetch("/api/ai/parse-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          buildings: buildings.filter((b) => b !== "ทั้งหมด"),
          rooms: (rooms || []).map((r) => ({ building: r.building, room: r.room })),
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid JSON" }));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const t = data.task as CleanParsedTask;
      // เติมเฉพาะช่องที่ AI ได้ค่ามา — ไม่ล้างค่าที่ผู้ใช้กรอกไว้แล้ว
      setValue("type", t.type, { shouldValidate: true, shouldDirty: true });
      if (t.building) setValue("building", t.building, { shouldValidate: true, shouldDirty: true });
      if (t.room) setValue("room", t.room, { shouldValidate: true, shouldDirty: true });
      if (t.date) setValue("date", t.date, { shouldValidate: true, shouldDirty: true });
      if (t.customer) setValue("customer", t.customer, { shouldDirty: true });
      if (t.phone) setValue("phone", t.phone, { shouldDirty: true });
      const note = [t.time ? `เวลา ${t.time}` : "", t.note].filter(Boolean).join(" · ");
      if (note) setValue("note", note, { shouldDirty: true });
      setAiUnsure(t.unsure);
      toast.success("AI เติมฟอร์มให้แล้ว — ตรวจแล้วกดบันทึก");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อ่านข้อความไม่สำเร็จ");
    } finally {
      setAiBusy(false);
    }
  }
  const showCustomerSection = TYPES_WITH_CUSTOMER.has(currentType);

  // Common-area toggle (Task 38) — show only for engineer task types
  // (ซ่อม / ทำสะอาด). Sales appointments always target a tenant room.
  const allowCommonArea = currentType === "ซ่อม" || currentType === "ทำสะอาด" || currentType === "อื่นๆ";
  // Cost field — only meaningful for engineer task types. Sales tasks
  // (ย้ายเข้า/ย้ายออก/ชมห้อง) don't carry costs; hiding cleans the form
  // and avoids accidental entry by sales role.
  const showCostField =
    currentType === "ซ่อม" || currentType === "ทำสะอาด" || currentType === "อื่นๆ";

  // Clear any leftover cost when switching to a sales task type, so
  // a stale value doesn't sneak into the submit payload.
  const currentCost = watch("cost");
  useEffect(() => {
    if (!showCostField && currentCost) {
      setValue("cost", "");
    }
  }, [showCostField, currentCost, setValue]);

  // Part picker — visible for ซ่อม tasks. Engineer selects which
  // parts were consumed; on submit we fire a requisition POST per
  // entry so the audit log + stock ledger stay consistent with the
  // repair task. Lazy-fetch the parts catalog the first time the
  // section appears (avoid loading for non-repair tasks).
  const showPartsPicker = currentType === "ซ่อม";
  const [allParts, setAllParts] = useState<Part[] | null>(null);
  const [partsLoading, setPartsLoading] = useState(false);
  const [usedParts, setUsedParts] = useState<Array<{ partId: string; partName: string; quantity: number; stock: number; unit: string }>>([]);
  const [partPick, setPartPick] = useState<string>("");
  const [partQty, setPartQty] = useState<string>("1");
  useEffect(() => {
    if (!showPartsPicker || allParts !== null || partsLoading) return;
    setPartsLoading(true);
    fetch("/api/parts", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setAllParts((data?.rows || []) as Part[]))
      .catch(() => setAllParts([]))
      .finally(() => setPartsLoading(false));
  }, [showPartsPicker, allParts, partsLoading]);
  // Reset used-parts list when type leaves "ซ่อม"
  useEffect(() => {
    if (!showPartsPicker && usedParts.length > 0) setUsedParts([]);
  }, [showPartsPicker, usedParts.length]);
  // Reset when modal closes — next open starts fresh
  useEffect(() => {
    if (!open) {
      setUsedParts([]);
      setPartPick("");
      setPartQty("1");
    }
  }, [open]);

  function addUsedPart() {
    const part = (allParts || []).find((p) => p.id === partPick);
    if (!part) return;
    const qty = parseInt(partQty, 10);
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (qty > part.stock) return;
    // If already added, sum qty
    setUsedParts((prev) => {
      const existing = prev.find((p) => p.partId === part.id);
      if (existing) {
        const newQty = Math.min(part.stock, existing.quantity + qty);
        return prev.map((p) => (p.partId === part.id ? { ...p, quantity: newQty } : p));
      }
      return [...prev, { partId: part.id, partName: part.name, quantity: qty, stock: part.stock, unit: part.unit }];
    });
    setPartPick("");
    setPartQty("1");
  }
  function removeUsedPart(partId: string) {
    setUsedParts((prev) => prev.filter((p) => p.partId !== partId));
  }

  /**
   * Wrap parent's onSubmit — after the task is saved successfully,
   * fire-and-forget POST per used-part to /api/part-requisitions.
   * Failures are surfaced via toast (parent decides own UX) but don't
   * block the task from being marked saved.
   *
   * The requisition's building/room is taken from the task itself
   * so the audit log + stock ledger naturally reflect "อะไหล่นี้
   * ถูกใช้ตอนซ่อมห้องนั้น".
   */
  const wrappedSubmit = useCallback(async (values: TaskFormValues) => {
    await onSubmit(values);
    if (usedParts.length === 0) return;
    const isCommon = values.room.startsWith(COMMON_AREA_PREFIX);
    const reqBuilding = values.building;
    const reqRoom = isCommon ? values.room : values.room;
    const taskKey = `${values.date}|${values.building}|${values.room}|${values.type}`;
    // audit r27: เดิมยิง POST แล้วทิ้ง response — 403/ของไม่พอ/ไม่เจอ SKU
    // ไม่มี toast สต๊อกไม่ลดทั้งที่ผู้ใช้คิดว่าเบิกแล้ว → ใช้ helper กลาง
    // ตัวเดียวกับหน้าซ่อมบำรุง (นับ ok/clamped และ toast ตามจริง)
    await fileRequisitionLines(usedParts, {
      building: reqBuilding, room: reqRoom, taskKey, jobNote: `ใช้ในงาน ${values.type}`,
    });
  }, [onSubmit, usedParts]);

  const currentRoom = watch("room");
  const isCommonMode = allowCommonArea && currentRoom?.startsWith(COMMON_AREA_PREFIX);
  const selectedCommonType = isCommonMode
    ? (currentRoom || "").slice(COMMON_AREA_PREFIX.length) || COMMON_AREA_TYPES[0]
    : COMMON_AREA_TYPES[0];

  function setLocationKind(kind: "room" | "common") {
    if (kind === "common") {
      setValue("room", formatCommonArea(COMMON_AREA_TYPES[0]), { shouldDirty: true, shouldValidate: false });
    } else {
      // Switching back to room mode — clear so user sees the placeholder
      setValue("room", "", { shouldDirty: true, shouldValidate: false });
    }
  }
  function setCommonAreaType(t: string) {
    setValue("room", formatCommonArea(t), { shouldDirty: true, shouldValidate: true });
  }

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

  // Coerce type to allowed value when role mix changes. Only the type
  // field is rewritten — a session refresh re-creates `roles` identity
  // and re-runs this; a full reset() here would wipe whatever the user
  // had already typed (building/room/customer/note) mid-edit.
  useEffect(() => {
    if (!open) return;
    if (!allowedTypes.includes(currentType)) {
      const next = defaultTypeFor(roles, currentType, defaultType);
      setValue("type", next, { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roles, allowedTypes]);

  /**
   * Guarded close — if the form is dirty, confirm before discarding so
   * users don't lose 5 fields of input from a stray Esc/backdrop click
   * (Task 34). Submitting/saving bypasses the guard since the action
   * is explicit.
   */
  const requestClose = useCallback(() => {
    if (saving || isSubmitting) return;
    if (isDirty) {
      const ok = typeof window !== "undefined"
        ? window.confirm("ยกเลิกการแจ้งซ่อม? ข้อมูลที่กรอกจะหายไป")
        : true;
      if (!ok) return;
    }
    onClose();
  }, [saving, isSubmitting, isDirty, onClose]);

  // Esc to close, Cmd/Ctrl+Enter to submit
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        requestClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit(wrappedSubmit)();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleSubmit, onSubmit, requestClose]);

  if (!open) return null;
  const busy = saving || isSubmitting;

  return (
    <div className="ac-modal-backdrop" onClick={() => requestClose()}>
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
          <button className="ac-modal-close" onClick={requestClose} aria-label="ปิด" type="button">✕</button>
        </header>

        <form onSubmit={handleSubmit(wrappedSubmit)}>
          <div className="ac-modal-body">
            {/* r31 (pattern line_to_task): แปะข้อความ LINE ให้ AI เติมฟอร์ม —
                ผู้ใช้ยังตรวจทุกช่องก่อนกดบันทึก (ช่องที่ AI เดาโชว์เป็นป้ายเตือน) */}
            <details className="ac-ai-paste" open={aiOpen} onToggle={(e) => setAiOpen((e.target as HTMLDetailsElement).open)}>
              <summary>📋 แปะข้อความ LINE ให้ AI เติมฟอร์ม</summary>
              <div className="ac-ai-paste-body">
                <textarea
                  rows={3}
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder={'เช่น "ห้อง 204 มีทอง แอร์ไม่เย็น มาดูพรุ่งนี้บ่ายได้ไหม คุณนก 081-234-5678"'}
                  aria-label="ข้อความ LINE"
                  disabled={aiBusy}
                />
                <div className="ac-ai-paste-actions">
                  <button
                    type="button"
                    className="ac-btn ac-btn-secondary ac-btn-sm"
                    onClick={() => void runAiParse()}
                    disabled={aiBusy || !aiText.trim()}
                  >{aiBusy ? "กำลังอ่าน…" : "✨ ให้ AI อ่าน"}</button>
                  {aiUnsure.length > 0 && (
                    <span className="ac-ai-unsure">
                      เติมให้แล้ว — เช็คช่อง: {aiUnsure.map((u) => FIELD_LABELS[u] || u).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </details>

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
                    {isCommonMode ? "พื้นที่ส่วนกลาง" : "เลขห้อง"} <span className="ac-required" aria-hidden>*</span>
                  </label>

                  {/* Location-kind toggle — only for engineer task types
                      (Task 38). Sales appointments always target a room. */}
                  {allowCommonArea && (
                    <div className="ac-form-toggle" role="radiogroup" aria-label="เลือกประเภทที่ตั้ง">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!isCommonMode}
                        className={`ac-form-toggle-btn ${!isCommonMode ? "is-active" : ""}`}
                        onClick={() => setLocationKind("room")}
                      >🚪 ห้องเช่า</button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!!isCommonMode}
                        className={`ac-form-toggle-btn ${isCommonMode ? "is-active" : ""}`}
                        onClick={() => setLocationKind("common")}
                      >🏢 ส่วนกลาง</button>
                    </div>
                  )}

                  {isCommonMode ? (
                    <select
                      id="ac-addtask-room"
                      aria-invalid={!!errors.room}
                      value={selectedCommonType}
                      onChange={(e) => setCommonAreaType(e.target.value)}
                    >
                      {COMMON_AREA_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="ac-addtask-room"
                      type="text"
                      placeholder={roomPlaceholder}
                      aria-invalid={!!errors.room}
                      {...register("room")}
                    />
                  )}

                  {errors.room ? (
                    <span className="ac-field-error">{errors.room.message}</span>
                  ) : !isCommonMode && roomHint ? (
                    <span className="ac-field-hint">{roomHint}</span>
                  ) : isCommonMode ? (
                    <span className="ac-field-hint">งานสาธารณูปโภค/พื้นที่รวม ไม่ผูกห้องผู้เช่า</span>
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

            {/* SECTION — อะไหล่ที่ใช้ (เฉพาะงานซ่อม)
                Selected parts trigger /api/part-requisitions POSTs
                after the task save succeeds, keeping inventory in
                sync without a separate "เบิก" step. */}
            {showPartsPicker && (
              <div className="ac-form-section">
                <div className="ac-form-section-label">
                  อะไหล่ที่ใช้ <span className="ac-form-section-optional">(ไม่บังคับ)</span>
                </div>
                <div className="ac-parts-picker-row">
                  <select
                    aria-label="เลือกอะไหล่"
                    className="ac-parts-picker-select"
                    value={partPick}
                    onChange={(e) => setPartPick(e.target.value)}
                    disabled={partsLoading || (allParts?.length ?? 0) === 0}
                  >
                    <option value="">— เลือกอะไหล่ —</option>
                    {(allParts || []).filter((p) => p.stock > 0).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (มี {p.stock} {p.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    className="ac-parts-picker-qty"
                    value={partQty}
                    onChange={(e) => setPartQty(e.target.value.replace(/[^\d]/g, ""))}
                    aria-label="จำนวน"
                    placeholder="จำนวน"
                  />
                  <button
                    type="button"
                    className="ac-btn ac-btn-ghost ac-btn-sm"
                    onClick={addUsedPart}
                    disabled={!partPick}
                  >+ เพิ่ม</button>
                </div>
                {usedParts.length > 0 && (
                  <ul className="ac-parts-picker-list">
                    {usedParts.map((p) => (
                      <li key={p.partId}>
                        <span className="ac-parts-picker-name">{p.partName}</span>
                        <span className="ac-parts-picker-q">×{p.quantity} {p.unit}</span>
                        <button
                          type="button"
                          className="ac-parts-picker-del"
                          onClick={() => removeUsedPart(p.partId)}
                          aria-label={`ลบ ${p.partName}`}
                        >×</button>
                      </li>
                    ))}
                  </ul>
                )}
                <span className="ac-field-hint">
                  สต๊อกจะถูกตัดอัตโนมัติเมื่อบันทึกงาน + บันทึก audit log
                </span>
              </div>
            )}

            {/* SECTION 4 — ค่าใช้จ่าย + หมายเหตุ
                Cost shown only for engineer task types — sales tasks
                (ย้ายเข้า/ย้ายออก/ชมห้อง) don't carry costs. */}
            <div className="ac-form-section">
              <div className="ac-form-section-label">
                {showCostField ? "ค่าใช้จ่าย · หมายเหตุ" : "หมายเหตุ"}
                {" "}<span className="ac-form-section-optional">(ไม่บังคับ)</span>
              </div>
              {showCostField && (
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
              )}
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
              <kbd>{modKey()}</kbd>+<kbd>↵</kbd> บันทึก · <kbd>esc</kbd> ปิด
            </span>
            <button
              type="button"
              className="ac-btn ac-btn-ghost"
              onClick={requestClose}
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
