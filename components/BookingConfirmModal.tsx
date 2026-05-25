"use client";

import { useEffect, useMemo, useState } from "react";
import { computeBooking } from "@/lib/bookingMath";
import { formatBookingMessage } from "@/lib/bookingMessage";
import { toast } from "@/lib/toast";

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
  /** Full generated LINE message — kept for the task note / audit. */
  message: string;
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

function parseMoney(s: string): number {
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
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
  const [apartmentName, setApartmentName] = useState(`${building} เรสซิเด้นท์`);
  const [tenant, setTenant] = useState(defaultTenant || "");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [moveInIso, setMoveInIso] = useState(todayIso());
  const [moveInTime, setMoveInTime] = useState("09:00");
  const [rent, setRent] = useState(String(parseMoney(defaultRent || "")) || "");
  const [deposit, setDeposit] = useState("");
  const [bookingPaid, setBookingPaid] = useState("");
  const [pet, setPet] = useState("");
  const [contractTerms, setContractTerms] = useState("ขั้นต่ำ 6 เดือนขึ้นไป");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const moveInDate = useMemo(() => isoToDate(moveInIso), [moveInIso]);

  const calc = useMemo(() => {
    if (!moveInDate) return null;
    return computeBooking({
      monthlyRent: parseMoney(rent),
      moveInDate,
      deposit: parseMoney(deposit),
      bookingPaid: parseMoney(bookingPaid),
    });
  }, [rent, moveInDate, deposit, bookingPaid]);

  const message = useMemo(() => {
    if (!moveInDate || !calc) return "";
    return formatBookingMessage({
      apartmentName: apartmentName.trim() || building,
      room,
      tenant: tenant.trim(),
      phone: phone.trim(),
      moveInDate,
      moveInTime: moveInTime.trim() || undefined,
      calc,
      pet,
      contractTerms,
    });
  }, [apartmentName, building, room, tenant, phone, moveInDate, moveInTime, calc, pet, contractTerms]);

  const fmt = (n: number) => n.toLocaleString("th-TH");
  const valid = !!(moveInDate && tenant.trim() && phone.trim() && parseMoney(rent) > 0);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("คัดลอกข้อความแล้ว — วางใน LINE ได้เลย");
    } catch {
      toast.error("คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความในกล่องแล้วคัดลอกเอง");
    }
  }

  function handleConfirm() {
    if (!valid || !moveInDate) return;
    onConfirm({
      building,
      room,
      tenant: tenant.trim(),
      phone: phone.trim(),
      monthlyRent: parseMoney(rent),
      moveInDateIso: moveInIso,
      moveInTime: moveInTime.trim(),
      message,
    });
  }

  return (
    <div className="ac-modal-backdrop" onClick={() => !saving && onClose()}>
      <div
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
          <button className="ac-modal-close" onClick={onClose} aria-label="ปิด" type="button">✕</button>
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
                  <input id="ac-bk-phone" type="tel" value={phone}
                    onChange={(e) => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" />
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
            </div>

            <div className="ac-form-section">
              <div className="ac-form-section-label">ยอดเงิน (บาท)</div>
              <div className="ac-form-row">
                <div className="ac-field">
                  <label htmlFor="ac-bk-rent">ค่าเช่า/เดือน</label>
                  <input id="ac-bk-rent" inputMode="numeric" value={rent}
                    onChange={(e) => setRent(e.target.value)} placeholder="5500" />
                </div>
                <div className="ac-field">
                  <label htmlFor="ac-bk-deposit">ค่าประกัน</label>
                  <input id="ac-bk-deposit" inputMode="numeric" value={deposit}
                    onChange={(e) => setDeposit(e.target.value)} placeholder="10000" />
                </div>
                <div className="ac-field">
                  <label htmlFor="ac-bk-paid">มัดจำที่จ่ายแล้ว</label>
                  <input id="ac-bk-paid" inputMode="numeric" value={bookingPaid}
                    onChange={(e) => setBookingPaid(e.target.value)} placeholder="5500" />
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
              <div className="ac-field">
                <label htmlFor="ac-bk-contract">เงื่อนไขสัญญา</label>
                <input id="ac-bk-contract" type="text" value={contractTerms}
                  onChange={(e) => setContractTerms(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="ac-booking-preview">
            {calc && (
              <div className="ac-booking-totals">
                {calc.nextMonthRent > 0 && (
                  <div className="ac-booking-total-row"><span>ค่าห้องรายเดือน</span><span>{fmt(calc.nextMonthRent)}</span></div>
                )}
                <div className="ac-booking-total-row"><span>ค่าห้องเฉลี่ย ({calc.proratedDays} วัน)</span><span>{fmt(calc.proratedAmount)}</span></div>
                <div className="ac-booking-total-row"><span>ค่าประกัน</span><span>{fmt(calc.deposit)}</span></div>
                <div className="ac-booking-total-row is-sum"><span>ยอดรวม</span><span>{fmt(calc.total)}</span></div>
                <div className="ac-booking-total-row"><span>ชำระมัดจำแล้ว</span><span>-{fmt(calc.bookingPaid)}</span></div>
                <div className="ac-booking-total-row is-remaining"><span>คงเหลือโอนเพิ่ม</span><span>{fmt(calc.remaining)}</span></div>
              </div>
            )}
            <label className="ac-booking-preview-label" htmlFor="ac-bk-msg">ข้อความสำหรับ LINE</label>
            <textarea id="ac-bk-msg" className="ac-booking-message" value={message} readOnly rows={14} />
            <button type="button" className="ac-btn ac-btn-secondary" onClick={copyMessage} disabled={!message}>
              📋 คัดลอกข้อความ
            </button>
          </div>
        </div>

        <footer className="ac-modal-foot ac-modal-foot-sticky">
          <button className="ac-btn ac-btn-ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button className="ac-btn ac-btn-primary" onClick={handleConfirm} disabled={!valid || saving}>
            {saving && <span className="ac-btn-spinner" aria-hidden />}
            {saving ? "กำลังบันทึก..." : "บันทึก & สร้างนัดย้ายเข้า"}
          </button>
        </footer>
      </div>
    </div>
  );
}
