"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { RoomView } from "@/types";
import { STATUS_LABEL, STATUS_DOT, RAW_STATUS_OPTIONS } from "@/lib/constants";
import { canEditTenant, canViewTenant, canViewFinancials, canAddSalesTask } from "@/lib/permissions";
import { useEffectiveRoles } from "@/lib/useEffectiveRoles";
import { parseThaiDate } from "@/lib/dateUtils";
import { sumCompletedCosts, formatBaht as formatTaskBaht } from "@/lib/taskCost";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { RoomEquipmentSkeleton } from "@/components/skeletons/ViewSkeletons";

// Lazy-load equipment tab: fetches the chunk + first API call only when
// the user clicks the "อุปกรณ์" tab
const RoomEquipmentTab = lazy(() => import("./RoomEquipmentTab"));
const RoomVehiclesTab = lazy(() => import("./RoomVehiclesTab"));

interface Props {
  room: RoomView;
  saving: boolean;
  status: string;
  tenant: string;
  phone: string;
  contractEnd: string;
  note: string;
  price: string;
  onChange: (patch: Partial<{
    status: string; tenant: string; phone: string;
    contractEnd: string; note: string; price: string;
  }>) => void;
  onClose: () => void;
  onSave: () => void;
  onAddTaskHere: () => void;
  /** Mode-specific initial tab ("info" or "equipment"). Defaults to "info". */
  defaultTab?: "info" | "equipment" | "vehicles";
  /**
   * Move-out workflow (Task 30). Optional — only used when the room's
   * current status is moveout. Each callback opens AddTaskModal with
   * a pre-filled task type + note appropriate for that step. Modal
   * closes the room view first (caller decision), so user lands on
   * the new task form directly.
   */
  onMoveoutInspect?: () => void;
  onMoveoutClean?: () => void;
  /** Move-in workflow companions — surface when room status = pending. */
  onMoveinClean?: () => void;
  onMoveinSchedule?: () => void;
  /** Open the booking-confirmation flow (generate LINE message + create
   *  the ย้ายเข้า appointment). Surfaced for ready/pending rooms. */
  onConfirmBooking?: () => void;
  /**
   * Prev/Next room navigation (#9). Optional — when omitted, the
   * header arrows + position label are hidden. When supplied, the
   * modal swaps to the previous / next room without closing,
   * keeping the user in flow for batch inspections.
   *
   * The parent owns the room list ordering, so the modal stays
   * agnostic to "what's next" — it just calls the handler.
   */
  onPrevRoom?: () => void;
  onNextRoom?: () => void;
  /** 1-based position used by the "ห้อง N / M" label. */
  roomIndex?: number;
  roomTotal?: number;
}

type TabKey = "info" | "equipment" | "vehicles";
type FieldKey = "price" | "phone" | "contractEnd";
type Errors = Partial<Record<FieldKey, string>>;

const TYPE_COLOR: Record<string, string> = {
  "ทำสะอาด": "#EAB308",
  "ย้ายเข้า": "#22C55E",
  "ย้ายออก": "#EF4444",
  "ชมห้อง": "#A855F7",
  "ซ่อม": "#F97316",
  "อื่นๆ": "#64748B",
};

/** Pure helpers (top-level so they're testable + obvious) */
function daysUntilContract(contractEnd: string): number | null {
  const d = parseThaiDate(contractEnd);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatBaht(s: string): string {
  if (!s) return "";
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("th-TH");
}

function relativeDate(s: string): string {
  const d = parseThaiDate(s);
  if (!d) return s || "—";
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "วันนี้";
  if (diff === 1) return "พรุ่งนี้";
  if (diff === -1) return "เมื่อวาน";
  if (diff > 1 && diff <= 7) return `ใน ${diff} วัน`;
  if (diff < -1 && diff >= -7) return `${Math.abs(diff)} วันที่แล้ว`;
  return s;
}

function validate(values: { price: string; phone: string; contractEnd: string }): Errors {
  const e: Errors = {};
  if (values.price) {
    const onlyDigits = values.price.replace(/[,\s]/g, "");
    if (!/^\d+$/.test(onlyDigits)) {
      e.price = "ราคาต้องเป็นตัวเลขเท่านั้น";
    }
  }
  if (values.phone) {
    const digits = values.phone.replace(/[^0-9]/g, "");
    if (digits.length > 0 && digits.length < 9) {
      e.phone = "เบอร์โทรสั้นเกินไป";
    }
  }
  if (values.contractEnd) {
    if (!/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(values.contractEnd.trim())) {
      e.contractEnd = "รูปแบบวันที่ไม่ถูกต้อง (dd/MM/yyyy)";
    }
  }
  return e;
}

export default function RoomModal({
  room, saving, status, tenant, phone, contractEnd, note, price,
  onChange, onClose, onSave, onAddTaskHere, defaultTab,
  onMoveoutInspect, onMoveoutClean,
  onMoveinClean, onMoveinSchedule, onConfirmBooking,
  onPrevRoom, onNextRoom, roomIndex, roomTotal,
}: Props) {
  const { data: session } = useSession();
  // Edit/view-tenant gates use ACTUAL roles — view-as preview must
  // not grant write capability. Cost display uses EFFECTIVE roles so
  // management can preview the engineer experience (no ฿ leakage).
  const canEdit = canEditTenant(session?.user?.roles);
  // Booking is a sales activity — gate the "ยืนยันการจอง" button by
  // sales-task permission (sales + management), NOT canEdit (which is
  // management-only room-field editing). The backend allows sales to do
  // the booking room write via room.editStatus.
  const canBook = canAddSalesTask(session?.user?.roles);
  const canSeeTenant = canViewTenant(session?.user?.roles);
  const { actualRoles, effectiveRoles } = useEffectiveRoles();
  const effRoles = effectiveRoles.length ? effectiveRoles : actualRoles;
  const canSeeCost = canViewFinancials(effRoles);
  const [tab, setTab] = useState<TabKey>(defaultTab || "info");
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, dialogRef);
  const [showHistory, setShowHistory] = useState(false);

  // Validation state — same UX as the redesigned add modals (PR #31)
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());

  useEffect(() => {
    // Reset validation each time a new room is opened
    setSubmitAttempted(false);
    setTouched(new Set());
    setTab(defaultTab || "info");
    setShowHistory(false);
  }, [room.building, room.room, defaultTab]);

  // Unsaved-changes guard (#9). Snapshot the form values at the moment
  // a new room becomes the modal's subject so we can detect drift.
  // We compare against the snapshot, NOT the raw room props — the
  // parent re-derives editStatus/etc from `room` via its own effect
  // so the snapshot is the true "loaded-and-unchanged" state.
  const initialRef = useRef<{ status: string; tenant: string; phone: string; contractEnd: string; price: string; note: string } | null>(null);
  useEffect(() => {
    initialRef.current = {
      status: room.rawStatus || "",
      tenant: room.tenant || "",
      phone: room.phone || "",
      contractEnd: room.contractEnd || "",
      price: room.price || "",
      note: "",
    };
  }, [room.building, room.room]);

  const isDirty = (() => {
    const i = initialRef.current;
    if (!i) return false;
    return (
      status !== i.status ||
      tenant !== i.tenant ||
      phone !== i.phone ||
      contractEnd !== i.contractEnd ||
      price !== i.price ||
      note !== i.note
    );
  })();

  // Browser confirm before throwing away dirty edits. Centralised so
  // every escape hatch (× / ESC / backdrop / prev / next) flows
  // through the same prompt and the same message.
  function confirmDiscardIfDirty(): boolean {
    if (!isDirty) return true;
    return window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก — ทิ้งการแก้ไขนี้?");
  }

  function attemptClose() {
    if (saving) return;
    if (!confirmDiscardIfDirty()) return;
    onClose();
  }
  function attemptPrev() {
    if (!onPrevRoom || saving) return;
    if (!confirmDiscardIfDirty()) return;
    onPrevRoom();
  }
  function attemptNext() {
    if (!onNextRoom || saving) return;
    if (!confirmDiscardIfDirty()) return;
    onNextRoom();
  }

  const errors = useMemo(
    () => validate({ price, phone, contractEnd }),
    [price, phone, contractEnd]
  );
  const hasErrors = Object.keys(errors).length > 0;

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

  function attemptSave() {
    setSubmitAttempted(true);
    if (hasErrors) return;
    onSave();
  }

  // Keyboard: Cmd/Ctrl+Enter = save · Esc = close · ← / → = prev / next room
  // The arrow handlers are skipped while the user is typing in an
  // input/textarea/select so they don't hijack normal text caret motion.
  useEffect(() => {
    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        attemptClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (canEdit && tab === "info") attemptSave();
      } else if (e.key === "ArrowLeft" && !isTypingTarget(e.target)) {
        if (onPrevRoom) { e.preventDefault(); attemptPrev(); }
      } else if (e.key === "ArrowRight" && !isTypingTarget(e.target)) {
        if (onNextRoom) { e.preventDefault(); attemptNext(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, canEdit, tab, hasErrors, price, phone, contractEnd, isDirty, onPrevRoom, onNextRoom]);

  /* ----- Derived header facts ----- */
  const daysLeft = daysUntilContract(contractEnd);
  const priceDisplay = formatBaht(price);
  const completedCostsTotal = useMemo(
    () => sumCompletedCosts(room.pastTasks),
    [room.pastTasks]
  );

  return (
    <div className="ac-modal-backdrop" onClick={attemptClose}>
      <div
        ref={dialogRef}
        className="ac-modal ac-modal-form"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-roommodal-title"
      >
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title" id="ac-roommodal-title">
              {room.building} {room.room}
            </div>
            <div className="ac-modal-sub">
              <span className="ac-legend-dot" style={{ background: STATUS_DOT[room.status] }} />
              {STATUS_LABEL[room.status]} · ชั้น {room.floor || "-"}
            </div>
            {/* At-a-glance fact chips */}
            <div className="ac-room-modal-chips">
              {priceDisplay && (
                <span className="ac-room-modal-chip">
                  <span className="ac-room-modal-chip-icon">฿</span>
                  {priceDisplay} <span className="ac-room-modal-chip-faint">/เดือน</span>
                </span>
              )}
              {/* contract-status chip uses room.status (not tenant truthy) so it
                  works for non-admin users who can't see the tenant name */}
              {room.status === "occupied" && daysLeft !== null && (
                <span className={`ac-room-modal-chip ${daysLeft < 0 ? "is-overdue" : daysLeft <= 30 ? "is-soon" : ""}`}>
                  {daysLeft < 0
                    ? `สัญญาหมดแล้ว ${Math.abs(daysLeft)} วัน`
                    : daysLeft === 0
                    ? "สัญญาหมดวันนี้"
                    : `สัญญาเหลือ ${daysLeft} วัน`}
                </span>
              )}
              {room.status === "ready" && (
                <span className="ac-room-modal-chip is-ready">ว่าง · พร้อมขาย</span>
              )}
              {room.pastTasks.length > 0 && (
                <span className="ac-room-modal-chip ac-room-modal-chip-muted">
                  ประวัติงาน {room.pastTasks.length} รายการ
                </span>
              )}
              {canSeeCost && completedCostsTotal > 0 && (
                <span className="ac-room-modal-chip ac-room-modal-chip-muted">
                  <span className="ac-room-modal-chip-icon">฿</span>
                  รวมที่ใช้จ่าย {formatTaskBaht(completedCostsTotal)}
                </span>
              )}
            </div>
          </div>
          <div className="ac-room-modal-nav">
            {(onPrevRoom || onNextRoom) && (
              <>
                <button
                  type="button"
                  className="ac-room-modal-nav-btn"
                  onClick={attemptPrev}
                  disabled={!onPrevRoom || saving}
                  aria-label="ห้องก่อนหน้า"
                  title="ห้องก่อนหน้า (←)"
                >‹</button>
                {typeof roomIndex === "number" && typeof roomTotal === "number" && roomTotal > 0 && (
                  <span className="ac-room-modal-nav-pos" aria-label={`ห้องที่ ${roomIndex} จาก ${roomTotal}`}>
                    {roomIndex} / {roomTotal}
                  </span>
                )}
                <button
                  type="button"
                  className="ac-room-modal-nav-btn"
                  onClick={attemptNext}
                  disabled={!onNextRoom || saving}
                  aria-label="ห้องถัดไป"
                  title="ห้องถัดไป (→)"
                >›</button>
              </>
            )}
            {isDirty && (
              <span className="ac-room-modal-dirty" title="มีการแก้ไขที่ยังไม่ได้บันทึก">●</span>
            )}
            <button className="ac-modal-close" onClick={attemptClose} aria-label="ปิด">✕</button>
          </div>
        </header>

        <nav className="ac-modal-tabs" role="tablist" aria-label="แท็บข้อมูลห้อง">
          <button
            role="tab"
            aria-selected={tab === "info"}
            className={`ac-modal-tab ${tab === "info" ? "is-active" : ""}`}
            onClick={() => setTab("info")}
          >ข้อมูล</button>
          <button
            role="tab"
            aria-selected={tab === "equipment"}
            className={`ac-modal-tab ${tab === "equipment" ? "is-active" : ""}`}
            onClick={() => setTab("equipment")}
          >อุปกรณ์</button>
          <button
            role="tab"
            aria-selected={tab === "vehicles"}
            className={`ac-modal-tab ${tab === "vehicles" ? "is-active" : ""}`}
            onClick={() => setTab("vehicles")}
          >ยานพาหนะ</button>
        </nav>

        <div className="ac-modal-body">
          {tab === "info" && (
            <>
              {!canEdit && (
                <div className="ac-banner ac-banner-info ac-room-readonly-banner">
                  ดูข้อมูลอย่างเดียว · เฉพาะ <strong>management</strong> แก้ไขข้อมูลห้องได้
                </div>
              )}

              {/* Booking — a vacant (ว่าง) room that's about to be
                  reserved. One tap opens the confirmation flow that
                  generates the LINE message + creates the ย้ายเข้า nat. */}
              {room.status === "ready" && canBook && onConfirmBooking && (
                <div className="ac-moveout-workflow ac-moveout-workflow--in" role="region" aria-label="จองห้อง">
                  <header className="ac-moveout-head">
                    <span className="ac-moveout-icon" aria-hidden>📋</span>
                    <div>
                      <h3 className="ac-moveout-title">จองห้องนี้</h3>
                      <p className="ac-moveout-sub">สร้างข้อความยืนยัน + นัดย้ายเข้าอัตโนมัติ</p>
                    </div>
                  </header>
                  <div className="ac-moveout-actions">
                    <button type="button" className="ac-btn ac-btn-primary" onClick={onConfirmBooking}>
                      📋 ยืนยันการจอง
                    </button>
                  </div>
                </div>
              )}

              {/* Move-IN workflow — surface when room is waiting for a
                  new tenant. Mirrors the move-OUT banner below for
                  symmetry; covers: schedule pre-arrival cleaning,
                  log the move-in event with customer details. */}
              {room.status === "pending" && canBook && (
                <div
                  className="ac-moveout-workflow ac-moveout-workflow--in"
                  role="region"
                  aria-label="ขั้นตอนย้ายเข้า"
                >
                  <header className="ac-moveout-head">
                    <span className="ac-moveout-icon" aria-hidden>📥</span>
                    <div>
                      <h3 className="ac-moveout-title">ขั้นตอนย้ายเข้า</h3>
                      <p className="ac-moveout-sub">
                        ห้องรอลูกค้าใหม่ — เตรียมห้องและบันทึกนัด
                      </p>
                    </div>
                  </header>
                  <div className="ac-moveout-actions">
                    {onConfirmBooking && (
                      <button
                        type="button"
                        className="ac-btn ac-btn-primary"
                        onClick={onConfirmBooking}
                      >📋 ยืนยันการจอง</button>
                    )}
                    {onMoveinClean && (
                      <button
                        type="button"
                        className="ac-btn ac-btn-secondary"
                        onClick={onMoveinClean}
                      >🧹 จองทำสะอาด</button>
                    )}
                    {onMoveinSchedule && (
                      <button
                        type="button"
                        className="ac-btn ac-btn-secondary"
                        onClick={onMoveinSchedule}
                      >📥 บันทึกวันย้ายเข้า</button>
                    )}
                  </div>
                </div>
              )}

              {/* Move-out workflow (Task 30) — surface when room status
                  is moveout so the user knows the next steps without
                  digging through tabs. Each button opens AddTaskModal
                  pre-filled. "เคลียร์ข้อมูลผู้เช่า" stages a local
                  field clear; user still presses Save to commit. */}
              {room.status === "moveout" && canEdit && (
                <div className="ac-moveout-workflow" role="region" aria-label="ขั้นตอนย้ายออก">
                  <header className="ac-moveout-head">
                    <span className="ac-moveout-icon" aria-hidden>📤</span>
                    <div>
                      <h3 className="ac-moveout-title">ขั้นตอนย้ายออก</h3>
                      <p className="ac-moveout-sub">
                        ห้องแจ้งย้ายออก — ดำเนินการต่อด้านล่าง
                      </p>
                    </div>
                  </header>
                  <div className="ac-moveout-actions">
                    {onMoveoutInspect && (
                      <button
                        type="button"
                        className="ac-btn ac-btn-secondary"
                        onClick={onMoveoutInspect}
                      >📋 จองตรวจห้อง</button>
                    )}
                    {onMoveoutClean && (
                      <button
                        type="button"
                        className="ac-btn ac-btn-secondary"
                        onClick={onMoveoutClean}
                      >🧹 จองทำสะอาด</button>
                    )}
                    <button
                      type="button"
                      className="ac-btn ac-btn-ghost"
                      onClick={() => {
                        // Stage tenant info clear — user still presses Save
                        onChange({ tenant: "", phone: "", contractEnd: "" });
                      }}
                      title="ล้างชื่อ/เบอร์/วันสัญญา — กด 'บันทึก' เพื่อยืนยัน"
                    >👤 ล้างข้อมูลผู้เช่า</button>
                  </div>
                </div>
              )}

              {/* SECTION — ผู้เช่าปัจจุบัน (เฉพาะ tenant.view permission) */}
              {canSeeTenant && (
                <div className="ac-form-section">
                  <div className="ac-form-section-label">ผู้เช่าปัจจุบัน</div>
                  <div className="ac-form-row">
                    <div className="ac-field">
                      <label htmlFor="ac-room-tenant">ชื่อผู้เช่า</label>
                      <input
                        id="ac-room-tenant"
                        type="text"
                        value={tenant}
                        onChange={(e) => onChange({ tenant: e.target.value })}
                        placeholder="ชื่อผู้เช่า"
                        readOnly={!canEdit}
                      />
                    </div>
                    <div className={`ac-field ${shouldShowError("phone") ? "has-error" : ""}`}>
                      <label htmlFor="ac-room-phone">
                        เบอร์ติดต่อ
                        {phone && (
                          <a
                            className="ac-room-phone-call"
                            href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
                            title={`โทรหา ${phone}`}
                          >📞 โทร</a>
                        )}
                      </label>
                      <input
                        id="ac-room-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => onChange({ phone: e.target.value })}
                        onBlur={() => markTouched("phone")}
                        placeholder="08x-xxx-xxxx"
                        readOnly={!canEdit}
                        aria-invalid={shouldShowError("phone") ? "true" : "false"}
                      />
                      {shouldShowError("phone") && (
                        <span className="ac-field-error">{errors.phone}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION — สัญญา · ราคา */}
              <div className="ac-form-section">
                <div className="ac-form-section-label">สัญญา · ราคา</div>
                <div className="ac-form-row">
                  <div className={`ac-field ${shouldShowError("contractEnd") ? "has-error" : ""}`}>
                    <label htmlFor="ac-room-contract">วันสัญญาหมด</label>
                    <input
                      id="ac-room-contract"
                      type="text"
                      value={contractEnd}
                      onChange={(e) => onChange({ contractEnd: e.target.value })}
                      onBlur={() => markTouched("contractEnd")}
                      placeholder="dd/MM/yyyy"
                      readOnly={!canEdit}
                      aria-invalid={shouldShowError("contractEnd") ? "true" : "false"}
                    />
                    {shouldShowError("contractEnd") && (
                      <span className="ac-field-error">{errors.contractEnd}</span>
                    )}
                    {!shouldShowError("contractEnd") && daysLeft !== null && (
                      <span className="ac-field-hint">
                        {daysLeft < 0
                          ? `หมดแล้ว ${Math.abs(daysLeft)} วัน`
                          : daysLeft === 0
                          ? "หมดวันนี้"
                          : `เหลือ ${daysLeft} วัน`}
                      </span>
                    )}
                  </div>
                  <div className={`ac-field ${shouldShowError("price") ? "has-error" : ""}`}>
                    <label htmlFor="ac-room-price">ราคา (บาท/เดือน)</label>
                    <input
                      id="ac-room-price"
                      type="text"
                      inputMode="numeric"
                      value={price}
                      onChange={(e) => onChange({ price: e.target.value })}
                      onBlur={() => markTouched("price")}
                      placeholder="เช่น 3500"
                      readOnly={!canEdit}
                      aria-invalid={shouldShowError("price") ? "true" : "false"}
                    />
                    {shouldShowError("price") && (
                      <span className="ac-field-error">{errors.price}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION — สถานะ */}
              <div className="ac-form-section">
                <div className="ac-form-section-label">สถานะห้อง</div>
                <div className="ac-field">
                  <label htmlFor="ac-room-status">สถานะ (ในชีต)</label>
                  <select
                    id="ac-room-status"
                    value={status}
                    onChange={(e) => onChange({ status: e.target.value })}
                    disabled={!canEdit}
                  >
                    <option value="">- เลือก -</option>
                    {RAW_STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                  <span className="ac-field-hint">
                    สถานะใน UI คำนวณจากสถานะนี้ + งานที่นัดล่วงหน้า
                  </span>
                </div>
              </div>

              {/* SECTION — หมายเหตุ */}
              <div className="ac-form-section">
                <div className="ac-form-section-label">
                  หมายเหตุ <span className="ac-form-section-optional">(ไม่บังคับ)</span>
                </div>
                <div className="ac-field">
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => onChange({ note: e.target.value })}
                    placeholder="บันทึกเพิ่มเติม..."
                    readOnly={!canEdit}
                  />
                </div>
              </div>

              {/* Upcoming tasks — visual upgrade */}
              {room.upcomingTasks.length > 0 && (
                <div className="ac-form-section">
                  <div className="ac-form-section-label">
                    งานที่นัดล่วงหน้า{" "}
                    <span className="ac-form-section-optional">({room.upcomingTasks.length})</span>
                  </div>
                  <ul className="ac-room-upcoming-list">
                    {room.upcomingTasks.map((t, i) => {
                      const dot = TYPE_COLOR[t.type] || "#64748B";
                      return (
                        <li key={i} className="ac-room-upcoming-item">
                          <span className="ac-room-upcoming-dot" style={{ background: dot }} />
                          <div className="ac-room-upcoming-main">
                            <div className="ac-room-upcoming-line1">
                              <strong>{t.type}</strong>
                              <span className="ac-room-upcoming-when">{relativeDate(t.date)}</span>
                              <span className="ac-room-upcoming-date">· {t.date}</span>
                            </div>
                            {(t.note || t.customer) && (
                              <div className="ac-room-upcoming-line2">
                                {t.customer && <span>{t.customer}</span>}
                                {t.note && (
                                  <span>{t.customer ? " · " : ""}{t.note}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Past tasks — collapsible */}
              {room.pastTasks.length > 0 && (
                <div className="ac-form-section">
                  <button
                    type="button"
                    className="ac-history-toggle"
                    onClick={() => setShowHistory((v) => !v)}
                    aria-expanded={showHistory}
                  >
                    <span>{showHistory ? "▾" : "▸"}</span>
                    <span>ประวัติงาน ({room.pastTasks.length})</span>
                  </button>
                  {showHistory && (
                    <ul className="ac-room-history-list">
                      {room.pastTasks.map((t, i) => {
                        const s = (t.status || "").trim();
                        const isDone = s === "เสร็จ" || s === "done" || s === "ปิดแล้ว";
                        const isCancel = s === "ยกเลิก" || s === "cancelled";
                        const dot = TYPE_COLOR[t.type] || "#64748B";
                        return (
                          <li
                            key={i}
                            className={`ac-room-history-item ${isDone ? "is-done" : ""} ${isCancel ? "is-cancelled" : ""}`}
                          >
                            <span className="ac-room-history-dot" style={{ background: dot }} />
                            <div className="ac-room-history-main">
                              <div className="ac-room-history-line1">
                                <strong>{t.type}</strong>
                                <span className="ac-room-history-date">· {t.date}</span>
                                {t.creator && (
                                  <span className="ac-room-history-by">· โดย {t.creator}</span>
                                )}
                                {canSeeCost && typeof t.cost === "number" && t.cost > 0 && (
                                  <span className="ac-room-history-cost">
                                    · {formatTaskBaht(t.cost)}
                                  </span>
                                )}
                              </div>
                              {t.customer && (
                                <div className="ac-room-history-line2">{t.customer}</div>
                              )}
                            </div>
                            <span className={`ac-room-history-status ${isDone ? "is-done" : ""} ${isCancel ? "is-cancelled" : ""}`}>
                              {s || "—"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "equipment" && (
            <Suspense fallback={<RoomEquipmentSkeleton />}>
              <RoomEquipmentTab
                building={room.building}
                room={room.room}
                pastTasks={room.pastTasks}
              />
            </Suspense>
          )}

          {tab === "vehicles" && (
            <Suspense fallback={<RoomEquipmentSkeleton />}>
              <RoomVehiclesTab building={room.building} room={room.room} />
            </Suspense>
          )}
        </div>

        <footer className="ac-modal-foot ac-modal-foot-sticky">
          {canEdit && tab === "info" && (
            <span className="ac-modal-foot-hint" aria-hidden>
              <kbd>⌘</kbd>+<kbd>↵</kbd> บันทึก · <kbd>esc</kbd> ปิด
            </span>
          )}
          <button
            className="ac-btn ac-btn-secondary ac-btn-foot-start"
            onClick={onAddTaskHere}
            disabled={saving}
            title="เพิ่มงานใหม่สำหรับห้องนี้"
          >
            + เพิ่มงานที่ห้องนี้
          </button>
          <button className="ac-btn ac-btn-ghost" onClick={attemptClose} disabled={saving}>
            ยกเลิก
          </button>
          {canEdit && tab === "info" && (
            <button
              className="ac-btn ac-btn-primary"
              onClick={attemptSave}
              disabled={saving}
            >
              {saving && <span className="ac-btn-spinner" aria-hidden />}
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
