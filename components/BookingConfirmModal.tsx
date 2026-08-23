"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { computeBooking } from "@/lib/bookingMath";
import {
  formatMessageForMode,
  moveInLabel,
  type BookingMessageMode,
  type BookingMessageInputV2,
} from "@/lib/bookingMessage";
import { apartmentNameFor, bankFor, defaultDepositFor, NOTE_CHIPS, PRORATE_MODE } from "@/lib/bookingConfig";
import { bookingWarnings, shouldAutoChargeNextMonth } from "@/lib/bookingWarnings";
import { formatThaiPhone, phoneDigits } from "@/lib/phoneFormat";
import { toast } from "@/lib/toast";
import { parsePriceOr0 as parseMoney } from "@/lib/money";

/**
 * Booking confirmation (dashboard-first). Staff fill the booking once
 * here; the modal computes the move-in totals, generates the LINE
 * message to copy into the chat, and — on confirm — writes the tenant
 * onto the room and creates a "ย้ายเข้า" appointment. Replaces hand-
 * typing the confirmation + manually updating the sheet (and the
 * fragile idea of parsing LINE back into the dashboard).
 */

export interface BookingSaveData {
  building: string;
  room: string;
  tenant: string;
  phone: string;
  monthlyRent: number;
  moveInDateIso: string; // yyyy-MM-dd
  moveInTime: string;
  /** Full LINE confirmation message (mode B, incl. hand edits) — the
   *  save handler writes it into the ย้ายเข้า task note for audit. */
  message: string;
  /** Booking figures (P2) — carried into the task note; the room sheet
   *  has no deposit columns, and the note is the audit artifact. */
  deposit: number;
  bookingPaid: number;
  remaining: number;
  pet: string;
}

interface Props {
  building: string;
  room: string;
  defaultTenant?: string;
  defaultPhone?: string;
  defaultRent?: string;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (data: BookingSaveData) => void | Promise<void>;
}

/** Keep only digits — what we store in state for money fields. Mirrors
 *  parseMoney's strip strategy without going through parseInt — used by
 *  the controlled-input onChange that needs the digit-only string. */
function moneyDigits(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

/** Group the stored digits for display (5500 → "5,500"). Caret stays
 *  put for the common case of appending at the end. */
function formatMoneyDisplay(s: string): string {
  const d = moneyDigits(s);
  return d ? Number(d).toLocaleString("th-TH") : "";
}

function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Parse a yyyy-MM-dd input string to a local Date (no TZ shift). */
function isoToDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export default function BookingConfirmModal({
  building, room, defaultTenant, defaultPhone, defaultRent, saving, onClose, onConfirm,
}: Props) {
  const [apartmentName, setApartmentName] = useState(apartmentNameFor(building));
  const [tenant, setTenant] = useState(defaultTenant || "");
  // Phone state = raw digits only; the input DISPLAYS the dashed form
  // (092-4561642) via formatThaiPhone. Raw digits stay safe for tel:
  // links and lead phone-matching.
  const [phone, setPhone] = useState(phoneDigits(defaultPhone || ""));
  const [moveInIso, setMoveInIso] = useState(todayIso());
  const [moveInTime, setMoveInTime] = useState("09:00");
  const [rent, setRent] = useState(String(parseMoney(defaultRent || "")) || "");
  // Prefill the REAL default deposit (P0-1). The old "" default + 10,000
  // placeholder computed as 0 — one hasty copy sent a customer a total
  // that was ฿10,000 short.
  const [deposit, setDeposit] = useState(String(defaultDepositFor(building)));
  const [bookingPaid, setBookingPaid] = useState("");
  // Collect the next full month up front (late-month move-ins). Default
  // off — an early move-in shouldn't be billed ~2 months at once.
  const [chargeNextMonth, setChargeNextMonth] = useState(false);
  const [pet, setPet] = useState("");
  const [contractTerms, setContractTerms] = useState("ขั้นต่ำ 6 เดือนขึ้นไป");
  // ===== P1 fields =====
  // ชื่อเล่น — real messages address the customer by nickname; blank
  // falls back to the full tenant name.
  const [nickname, setNickname] = useState("");
  const [vaccineDocumented, setVaccineDocumented] = useState(false);
  // สถานะมัดจำ gates the flow: "pending" = still requesting the deposit
  // (mode A, can't save yet — no card before the money), "paid" = the
  // normal confirm flow. Default paid (today's behavior).
  const [depositStatus, setDepositStatus] = useState<"pending" | "paid">("paid");
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [discountAmt, setDiscountAmt] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  // ===== 3 message modes (P0-5) + hand-edit overrides (P0-2) =====
  // The admin's real workflow sends 3 LINE messages: ขอมัดจำ (A) →
  // ยืนยันการจอง (B) → สิ่งที่ต้องเตรียม (C), all from the same form.
  const [msgMode, setMsgMode] = useState<BookingMessageMode>("B");
  // Hand-edits are kept PER MODE and never cleared by mode switches or
  // form edits — regenerating only happens via the explicit ↻ button.
  const [overrides, setOverrides] = useState<Partial<Record<BookingMessageMode, string>>>({});
  // P2: per-mode "what was last copied" — the footer indicator compares
  // it against the CURRENT text, so any edit that changes the message
  // automatically flips back to "ยังไม่ได้คัดลอก".
  const [lastCopied, setLastCopied] = useState<Partial<Record<BookingMessageMode, string>>>({});

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, dialogRef);

  // P2 unsaved-close guard: dirty = any field differs from its initial
  // value OR a hand-edited message exists. Same UX as RoomModal.
  const initialRef = useRef({
    tenant: defaultTenant || "",
    phone: phoneDigits(defaultPhone || ""),
    rent: String(parseMoney(defaultRent || "")) || "",
    deposit: String(defaultDepositFor(building)),
    moveInIso: todayIso(),
    apartmentName: apartmentNameFor(building),
  });
  // Every user-editable field counts — audit r12 found the first cut
  // covered so few fields that typed มัดจำ/date/time closed silently.
  // (chargeNextMonth/depositStatus stay out: cheap toggles, and the
  // auto-tick effect would otherwise mark a fresh modal dirty.)
  const isDirty =
    tenant !== initialRef.current.tenant ||
    phone !== initialRef.current.phone ||
    rent !== initialRef.current.rent ||
    deposit !== initialRef.current.deposit ||
    moveInIso !== initialRef.current.moveInIso ||
    apartmentName !== initialRef.current.apartmentName ||
    moveInTime !== "09:00" ||
    bookingPaid !== "" ||
    pet !== "" ||
    contractTerms !== "ขั้นต่ำ 6 เดือนขึ้นไป" ||
    nickname !== "" ||
    vaccineDocumented ||
    selectedChips.size > 0 ||
    discountAmt !== "" ||
    discountReason !== "" ||
    Object.keys(overrides).length > 0;

  function attemptClose() {
    if (saving) return;
    if (isDirty && !window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก — ทิ้งการแก้ไขนี้?")) return;
    onClose();
  }

  // Esc → guarded close; Ctrl/Cmd+Enter → save (same keys as RoomModal).
  // Re-registered per render so the handlers never go stale.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        attemptClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) handleConfirm(); // holding the key must not re-fire
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const moveInDate = useMemo(() => isoToDate(moveInIso), [moveInIso]);

  // P1-3 auto-tick: late-month move-in (≥25th) checks เก็บเดือนถัดไป by
  // itself — but a manual toggle wins forever after (touched ref).
  const chargeNextTouchedRef = useRef(false);
  const autoTicked = !chargeNextTouchedRef.current && !!moveInDate && shouldAutoChargeNextMonth(moveInDate);
  useEffect(() => {
    if (!moveInDate || chargeNextTouchedRef.current) return;
    setChargeNextMonth(shouldAutoChargeNextMonth(moveInDate));
  }, [moveInDate]);

  // P1-1 สถานะมัดจำ drives the mode — unless the user picked a tab by
  // hand afterwards (touched ref, same pattern as auto-tick).
  const modeTouchedRef = useRef(false);
  function setDepositStatusAndMode(s: "pending" | "paid") {
    setDepositStatus(s);
    // Pending = ยังไม่ได้เงินเลย → เริ่มที่ขั้น ① สรุปยอด (ลูกค้าต้องเห็น
    // ยอดเต็มก่อนตัดสินใจ — มติเจ้าของ 2026-08) แล้วค่อยไล่ไปขอมัดจำ.
    if (!modeTouchedRef.current) setMsgMode(s === "pending" ? "S" : "B");
    // Pending = we're about to ASK for the deposit — an empty
    // "มัดจำที่จ่ายแล้ว" would put "ยอดมัดจำ: 0 บาท" in the request
    // message (audit r12). Default the ask to one month's rent.
    if (s === "pending" && parseMoney(bookingPaid) <= 0 && parseMoney(rent) > 0) {
      setBookingPaid(moneyDigits(rent));
    }
  }

  const calc = useMemo(() => {
    if (!moveInDate) return null;
    return computeBooking({
      monthlyRent: parseMoney(rent),
      moveInDate,
      deposit: parseMoney(deposit),
      bookingPaid: parseMoney(bookingPaid),
      chargeNextMonth,
      prorateMode: PRORATE_MODE,
      discount: parseMoney(discountAmt),
    });
  }, [rent, moveInDate, deposit, bookingPaid, chargeNextMonth, discountAmt]);

  // P1-2 advisory warnings — never gate saving/copying.
  const warnings = useMemo(
    () => (moveInDate ? bookingWarnings({ moveInDate, moveInTime }) : []),
    [moveInDate, moveInTime]
  );

  // All three mode messages, regenerated from the form. Overrides (hand
  // edits) shadow these per mode; displayed() picks the right one.
  const generated = useMemo((): Record<BookingMessageMode, string> => {
    if (!moveInDate || !calc) return { S: "", A: "", B: "", C: "" };
    const input: BookingMessageInputV2 = {
      apartmentName: apartmentName.trim() || building,
      room,
      tenant: tenant.trim(),
      phone: formatThaiPhone(phone),
      moveInDate,
      moveInTime: moveInTime.trim() || undefined,
      calc,
      pet,
      contractTerms,
      nickname,
      vaccineDocumented,
      noteChipLines: NOTE_CHIPS.filter((c) => selectedChips.has(c.id)).map((c) => c.line),
      discountReason,
      bank: bankFor(building),
    };
    return {
      S: formatMessageForMode("S", input),
      A: formatMessageForMode("A", input),
      B: formatMessageForMode("B", input),
      C: formatMessageForMode("C", input),
    };
  }, [apartmentName, building, room, tenant, phone, moveInDate, moveInTime, calc, pet, contractTerms,
      nickname, vaccineDocumented, selectedChips, discountReason]);

  const displayed = (m: BookingMessageMode) => overrides[m] ?? generated[m];
  const message = displayed(msgMode);
  // Dirty only while the override actually DIFFERS — typing the text
  // back to the generated form counts as clean again.
  const msgDirty = overrides[msgMode] !== undefined && overrides[msgMode] !== generated[msgMode];

  function regenerateCurrent() {
    if (msgDirty && !window.confirm("ทิ้งข้อความที่แก้เอง แล้วสร้างใหม่จากข้อมูลในฟอร์ม?")) return;
    setOverrides((o) => {
      const next = { ...o };
      delete next[msgMode];
      return next;
    });
  }

  const fmt = (n: number) => n.toLocaleString("th-TH");
  const valid = !!(moveInDate && tenant.trim() && phone.trim() && parseMoney(rent) > 0);

  // Spell out what's still missing so the disabled "บันทึก" button isn't
  // a dead end — staff see exactly which required field to fill.
  const missing: string[] = [];
  if (!tenant.trim()) missing.push("ชื่อผู้เช่า");
  if (!phone.trim()) missing.push("เบอร์ติดต่อ");
  if (parseMoney(rent) <= 0) missing.push("ค่าเช่า");
  if (!moveInDate) missing.push("วันที่เข้าพัก");
  const missingTitle = missing.length ? `ยังไม่ครบ: ${missing.join(" · ")}` : undefined;
  // P1-1: no confirmation card before the money — mode A is for asking,
  // saving the booking waits for the slip.
  const saveBlocked = depositStatus === "pending";

  async function copyText(text: string, label: string, modes: BookingMessageMode[]) {
    try {
      await navigator.clipboard.writeText(text);
      // Remember what was copied per mode — the footer indicator compares
      // against the current text, so later edits un-check it by themselves.
      setLastCopied((prev) => {
        const next = { ...prev };
        for (const m of modes) next[m] = displayed(m);
        return next;
      });
      toast.success(`คัดลอก${label}แล้ว ✓ — วางใน LINE ได้เลย`);
    } catch {
      toast.error("คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความในกล่องแล้วคัดลอกเอง");
    }
  }

  const copiedCurrent = lastCopied[msgMode] !== undefined && lastCopied[msgMode] === message;

  function handleConfirm() {
    // `saving` guard: the BUTTON is disabled while saving but the
    // Ctrl+Enter path is not — without this, a double press piles a
    // second bookRoom + a duplicate ย้ายเข้า task (audit r12, HIGH).
    if (!valid || !moveInDate || !calc || saveBlocked || saving) return;
    onConfirm({
      building,
      room,
      tenant: tenant.trim(),
      phone,
      monthlyRent: parseMoney(rent),
      moveInDateIso: moveInIso,
      moveInTime: moveInTime.trim(),
      // What the tenant actually receives — respects hand edits.
      message: displayed("B"),
      deposit: calc.deposit,
      bookingPaid: calc.bookingPaid,
      remaining: calc.remaining,
      pet: pet.trim(),
    });
  }

  const MODE_LABEL: Record<BookingMessageMode, string> = {
    S: "สรุปยอด",
    A: "ขอมัดจำ",
    B: "ยืนยันการจอง",
    C: "สิ่งที่ต้องเตรียม",
  };
  const MODE_STEP: Record<BookingMessageMode, string> = { S: "1", A: "2", B: "3", C: "4" };
  // One line under the tabs telling staff WHEN to send this message —
  // the 4 modes are a sequence, not alternatives.
  const MODE_DESC: Record<BookingMessageMode, string> = {
    S: "ส่งเป็นข้อความแรก — แจ้งยอดทั้งหมดให้ลูกค้ารู้ก่อนตัดสินใจ (ยอดเต็ม ยังไม่หักมัดจำ)",
    A: "ส่งตอนลูกค้าตกลงจอง — ขอโอนมัดจำ พร้อมเลขบัญชี",
    B: "ส่งหลังได้สลิปมัดจำ — สรุปยอดที่ต้องจ่ายวันเข้าพัก",
    C: "ส่งก่อนวันเข้าพัก — เอกสารที่ต้องเตรียม + ยอดโอนส่วนที่เหลือ",
  };

  return (
    <div className="ac-modal-backdrop" onClick={attemptClose}>
      <div
        ref={dialogRef}
        className="ac-modal ac-modal-form ac-booking-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="ยืนยันการจอง"
      >
        <header className="ac-modal-head">
          <div>
            <div className="ac-modal-title">ยืนยันการจอง</div>
            <div className="ac-modal-sub">{building} ห้อง {room}</div>
          </div>
          <button className="ac-modal-close" onClick={attemptClose} aria-label="ปิด" type="button">✕</button>
        </header>

        <div className="ac-modal-body ac-booking-body">
          <div className="ac-booking-form">
            <div className="ac-form-section">
              <div className="ac-form-section-label">ผู้เช่า</div>
              <div className="ac-form-row">
                <div className="ac-field">
                  <label htmlFor="ac-bk-tenant">ชื่อผู้เช่า</label>
                  <input id="ac-bk-tenant" type="text" value={tenant}
                    onChange={(e) => setTenant(e.target.value)} placeholder="ชื่อผู้เช่า" />
                </div>
                <div className="ac-field">
                  <label htmlFor="ac-bk-phone">เบอร์ติดต่อ</label>
                  <input id="ac-bk-phone" type="tel" value={formatThaiPhone(phone)}
                    onChange={(e) => setPhone(phoneDigits(e.target.value))} placeholder="092-4561642" />
                </div>
              </div>
              <div className="ac-field">
                <label htmlFor="ac-bk-apt">ชื่อหอ (สำหรับข้อความ)</label>
                <input id="ac-bk-apt" type="text" value={apartmentName}
                  onChange={(e) => setApartmentName(e.target.value)} />
              </div>
            </div>

            <div className="ac-form-section">
              <div className="ac-form-section-label">วันเข้าพัก</div>
              <div className="ac-form-row">
                <div className="ac-field">
                  <label htmlFor="ac-bk-date">วันที่</label>
                  <input id="ac-bk-date" type="date" value={moveInIso}
                    onChange={(e) => setMoveInIso(e.target.value)} />
                </div>
                <div className="ac-field">
                  <label htmlFor="ac-bk-time">เวลา</label>
                  <input id="ac-bk-time" type="time" value={moveInTime}
                    onChange={(e) => setMoveInTime(e.target.value)} />
                </div>
              </div>
              {/* Echo the date in Thai/Buddhist-era form — the native picker
                  shows ค.ศ. but the LINE message uses พ.ศ., so this keeps
                  what staff confirm consistent with what the tenant sees. */}
              {moveInDate && (
                <div className="ac-booking-date-hint">📅 {moveInLabel(moveInDate, moveInTime.trim() || undefined)}</div>
              )}
              {warnings.map((w) => (
                <div key={w} className="ac-banner ac-banner-warn ac-booking-warn">⚠️ {w}</div>
              ))}
            </div>

            <div className="ac-form-section">
              <div className="ac-form-section-label">ยอดเงิน (บาท)</div>
              <div className="ac-form-row">
                <div className="ac-field">
                  <label htmlFor="ac-bk-rent">ค่าเช่า/เดือน</label>
                  <input id="ac-bk-rent" inputMode="numeric" value={formatMoneyDisplay(rent)}
                    onChange={(e) => setRent(moneyDigits(e.target.value))} placeholder="5,500" />
                </div>
                <div className="ac-field">
                  <label htmlFor="ac-bk-deposit">ค่าประกัน</label>
                  <input id="ac-bk-deposit" inputMode="numeric" value={formatMoneyDisplay(deposit)}
                    onChange={(e) => setDeposit(moneyDigits(e.target.value))} placeholder="10,000" />
                </div>
                <div className="ac-field">
                  <label htmlFor="ac-bk-paid">ยอดมัดจำจอง</label>
                  <input id="ac-bk-paid" inputMode="numeric" value={formatMoneyDisplay(bookingPaid)}
                    onChange={(e) => setBookingPaid(moneyDigits(e.target.value))} placeholder="5,500" />
                  <button
                    type="button"
                    className="ac-booking-paid-shortcut"
                    onClick={() => setBookingPaid(moneyDigits(rent))}
                    disabled={parseMoney(rent) <= 0}
                    title="ตั้งมัดจำเท่าค่าเช่า 1 เดือน"
                  >= ค่าเช่า 1 เดือน</button>
                </div>
              </div>
              {/* P1-1 สถานะมัดจำ — "ยังไม่โอน" flips to the ขอมัดจำ message
                  and blocks saving: no confirmation card before the money. */}
              <div className="ac-booking-radio-row" role="radiogroup" aria-label="สถานะมัดจำ">
                <span className="ac-booking-radio-label">ลูกค้าโอนมัดจำแล้วหรือยัง?</span>
                <label className="ac-booking-radio">
                  <input type="radio" name="ac-bk-depstatus" checked={depositStatus === "pending"}
                    onChange={() => setDepositStatusAndMode("pending")} />
                  <span>ยังไม่โอน</span>
                </label>
                <label className="ac-booking-radio">
                  <input type="radio" name="ac-bk-depstatus" checked={depositStatus === "paid"}
                    onChange={() => setDepositStatusAndMode("paid")} />
                  <span>โอนแล้ว (ได้สลิป)</span>
                </label>
              </div>

              <label className="ac-booking-checkbox">
                <input
                  type="checkbox"
                  checked={chargeNextMonth}
                  onChange={(e) => {
                    chargeNextTouchedRef.current = true;
                    setChargeNextMonth(e.target.checked);
                  }}
                />
                <span>
                  เก็บค่าเช่าเดือนถัดไปล่วงหน้า{" "}
                  <span className="ac-booking-checkbox-hint">
                    {autoTicked && chargeNextMonth
                      ? "(เข้าปลายเดือน ระบบติ๊กให้อัตโนมัติ — เอาออกได้)"
                      : "(ติ๊กเมื่อเข้าปลายเดือน)"}
                  </span>
                </span>
              </label>

              {/* P1-3 ปรับยอด/ส่วนลด — flows into totals + the message, so
                  staff never hand-edit numbers inside the text box. */}
              <div className="ac-form-row">
                <div className="ac-field">
                  <label htmlFor="ac-bk-discount">ปรับยอด/ส่วนลด</label>
                  <input id="ac-bk-discount" inputMode="numeric" value={formatMoneyDisplay(discountAmt)}
                    onChange={(e) => setDiscountAmt(moneyDigits(e.target.value))} placeholder="0" />
                </div>
                <div className="ac-field">
                  <label htmlFor="ac-bk-discount-reason">เหตุผล (โชว์ในข้อความ)</label>
                  <input id="ac-bk-discount-reason" type="text" value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)} placeholder="เช่น โปรย้ายเข้าเดือนนี้" />
                </div>
              </div>
            </div>

            <div className="ac-form-section">
              <div className="ac-form-section-label">ข้อมูลเพิ่มเติม (ไม่บังคับ)</div>
              <div className="ac-field">
                <label htmlFor="ac-bk-pet">สัตว์เลี้ยง</label>
                <input id="ac-bk-pet" type="text" value={pet}
                  onChange={(e) => setPet(e.target.value)} placeholder="น้องแมว 1 ตัว…" />
              </div>
              {pet.trim() && (
                <>
                  <label className="ac-booking-checkbox">
                    <input type="checkbox" checked={vaccineDocumented}
                      onChange={(e) => setVaccineDocumented(e.target.checked)} />
                    <span>มีเอกสารวัคซีนแล้ว <span className="ac-booking-checkbox-hint">(ต่อท้ายบรรทัดสัตว์เลี้ยงในข้อความ)</span></span>
                  </label>
                  {!vaccineDocumented && (
                    <div className="ac-booking-vaccine-hint">ยังไม่ได้ยืนยันเอกสารวัคซีน</div>
                  )}
                </>
              )}
              <div className="ac-field">
                <label htmlFor="ac-bk-contract">เงื่อนไขสัญญา</label>
                <input id="ac-bk-contract" type="text" value={contractTerms}
                  onChange={(e) => setContractTerms(e.target.value)} />
              </div>
              <div className="ac-field">
                <label htmlFor="ac-bk-nickname">ชื่อเล่น (สำหรับเรียกในข้อความ)</label>
                <input id="ac-bk-nickname" type="text" value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="เว้นว่าง = ใช้ชื่อผู้เช่า" />
              </div>
              {/* P1-1 chips หมายเหตุ — one tap adds the standard lines to
                  the ข้อมูลเพิ่มเติม block. */}
              <div className="ac-field">
                <span className="ac-booking-chips-label">หมายเหตุเพิ่มเติม</span>
                <div className="ac-chips">
                  {NOTE_CHIPS.map((c) => (
                    <button key={c.id} type="button"
                      className={`ac-chip ${selectedChips.has(c.id) ? "is-active" : ""}`}
                      aria-pressed={selectedChips.has(c.id)}
                      onClick={() => setSelectedChips((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                        return next;
                      })}
                    >{c.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="ac-booking-preview">
            {calc && (
              <div className="ac-booking-totals">
                <div className="ac-booking-totals-head">💰 สรุปยอดวันเข้าพัก</div>
                {calc.nextMonthRent > 0 && (
                  <div className="ac-booking-total-row"><span>ค่าห้องรายเดือน</span><span>{fmt(calc.nextMonthRent)}</span></div>
                )}
                <div className="ac-booking-total-row"><span>ค่าห้องตามจำนวนวัน ({calc.proratedDays} วัน)</span><span>{fmt(calc.proratedAmount)}</span></div>
                {calc.monthlyRent > 0 && calc.proratedDays > 0 && (
                  <div className="ac-booking-formula">{fmt(calc.monthlyRent)} ÷ {calc.prorateDivisor} วัน × {calc.proratedDays} วัน</div>
                )}
                <div className="ac-booking-total-row"><span>ค่าประกัน</span><span>{fmt(calc.deposit)}</span></div>
                {calc.discount > 0 && (
                  <div className="ac-booking-total-row"><span>ส่วนลด{discountReason.trim() ? ` (${discountReason.trim()})` : ""}</span><span>-{fmt(calc.discount)}</span></div>
                )}
                <div className="ac-booking-total-row is-sum"><span>ยอดรวม</span><span>{fmt(calc.total)}</span></div>
                <div className="ac-booking-total-row"><span>{depositStatus === "pending" ? "มัดจำ (รอโอน)" : "ชำระมัดจำแล้ว"}</span><span>-{fmt(calc.bookingPaid)}</span></div>
                <div className="ac-booking-total-row is-remaining"><span>คงเหลือโอนเพิ่ม</span><span>{fmt(calc.remaining)}</span></div>
              </div>
            )}
            {/* P0-1: a zero deposit is almost always the placeholder trap,
                not a real free-deposit deal — flag it loudly. */}
            {calc && calc.deposit === 0 && (
              <div className="ac-banner ac-banner-warn ac-booking-warn">
                ⚠️ ค่าประกันเป็น 0 — ยืนยันว่าถูกต้องไหม?
              </div>
            )}
            {calc && msgMode === "A" && calc.bookingPaid === 0 && (
              <div className="ac-banner ac-banner-warn ac-booking-warn">
                ⚠️ ยอดมัดจำเป็น 0 — ใส่ช่อง &quot;มัดจำที่จ่ายแล้ว&quot; ก่อนส่งขอมัดจำ
              </div>
            )}
            {calc && calc.remaining < 0 && (
              <div className="ac-banner ac-banner-warn ac-booking-warn">
                ⚠️ ยอดคงเหลือติดลบ ({fmt(calc.remaining)}) — ตรวจส่วนลด/มัดจำอีกครั้ง
              </div>
            )}

            {/* P0-5: one form → three LINE messages the admin actually
                sends (ขอมัดจำ → ยืนยัน → สิ่งที่ต้องเตรียม). */}
            <div className="ac-chips ac-booking-modes" role="tablist" aria-label="เลือกแบบข้อความ">
              {(["S", "A", "B", "C"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={msgMode === m}
                  className={`ac-chip ${msgMode === m ? "is-active" : ""}`}
                  onClick={() => {
                    modeTouchedRef.current = true;
                    setMsgMode(m);
                  }}
                >
                  <span className="ac-booking-mode-step" aria-hidden>{MODE_STEP[m]}</span>
                  {MODE_LABEL[m]}
                  {overrides[m] !== undefined && overrides[m] !== generated[m] ? " ✏️" : ""}
                </button>
              ))}
            </div>
            <div className="ac-booking-mode-desc">{MODE_DESC[msgMode]}</div>

            <div className="ac-booking-msg-head">
              <label className="ac-booking-preview-label" htmlFor="ac-bk-msg">
                ข้อความสำหรับ LINE
              </label>
              <div className="ac-booking-copy-row">
                <button
                  type="button"
                  className="ac-btn ac-btn-secondary"
                  onClick={() => void copyText(message, `ข้อความ "${MODE_LABEL[msgMode]}"`, [msgMode])}
                  disabled={!valid}
                  title={missingTitle}
                >
                  📋 คัดลอกข้อความนี้
                </button>
                <button
                  type="button"
                  className="ac-btn ac-btn-ghost"
                  onClick={() => void copyText(`${displayed("B")}\n\n${displayed("C")}`, "ข้อความยืนยัน + สิ่งที่ต้องเตรียม", ["B", "C"])}
                  disabled={!valid}
                  title={missingTitle || "คัดลอกข้อความยืนยัน + สิ่งที่ต้องเตรียม ไว้วางสองรอบใน LINE"}
                >
                  📑 ขั้น 3+4 ต่อกัน
                </button>
              </div>
            </div>
            {/* P0-2: hand edits shadow the generated text per mode; form
                changes never clobber them — only the explicit ↻ does. */}
            {msgDirty && (
              <div className="ac-booking-dirtybar">
                <span>✏️ แก้ข้อความเองอยู่ — ตัวเลขอาจไม่ตรงกับฟอร์ม</span>
                <button type="button" className="ac-btn ac-btn-ghost" onClick={regenerateCurrent}>
                  ↻ สร้างใหม่จากข้อมูล
                </button>
              </div>
            )}
            <textarea
              id="ac-bk-msg"
              className="ac-booking-message"
              value={message}
              rows={14}
              onChange={(e) => setOverrides((o) => ({ ...o, [msgMode]: e.target.value }))}
            />
          </div>
        </div>

        <footer className="ac-modal-foot ac-modal-foot-sticky ac-booking-foot">
          {calc && (
            <div className="ac-booking-foot-sum" aria-live="polite">
              <span className="ac-booking-foot-sum-label">คงเหลือโอนเพิ่ม</span>
              <span className="ac-booking-foot-sum-val">฿{fmt(calc.remaining)}</span>
            </div>
          )}
          {!valid && missing.length > 0 && (
            <div className="ac-booking-foot-hint" id="ac-bk-missing">
              ยังไม่ครบ: {missing.join(" · ")}
            </div>
          )}
          {saveBlocked && (
            <div className="ac-booking-foot-hint">โอนมัดจำก่อนจึงบันทึกการจองได้ — ส่งข้อความ "ขอมัดจำ" แล้วรอสลิป</div>
          )}
          {/* P2: don't let staff save-and-close while forgetting to send
              the message — the indicator tracks the CURRENT mode's text. */}
          {valid && (
            <div className={`ac-booking-copied ${copiedCurrent ? "is-copied" : ""}`} aria-live="polite">
              {copiedCurrent ? "คัดลอกแล้ว ✓" : "ยังไม่ได้คัดลอกข้อความ"}
            </div>
          )}
          <div className="ac-booking-foot-actions">
            <button className="ac-btn ac-btn-ghost" onClick={attemptClose} disabled={saving}>ยกเลิก</button>
            <button
              className="ac-btn ac-btn-primary"
              onClick={handleConfirm}
              disabled={!valid || saving || saveBlocked}
              aria-describedby={!valid && missing.length > 0 ? "ac-bk-missing" : undefined}
            >
              {saving && <span className="ac-btn-spinner" aria-hidden />}
              {saving ? "กำลังบันทึก..." : "บันทึก & สร้างนัดย้ายเข้า"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
