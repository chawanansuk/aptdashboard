import type { BookingCalc } from "./bookingMath";

/**
 * Render the LINE booking-confirmation message from structured booking
 * data — the dashboard-first replacement for staff hand-typing it. The
 * format mirrors the existing confirmations (✅ ยืนยันการจอง … 💰 สรุปยอด …).
 */

const THAI_WEEKDAY = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_MONTH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function baht(n: number): string {
  return n.toLocaleString("th-TH");
}

/** "เสาร์ที่ 30 พฤษภาคม 2569 (09:00)" — Buddhist-era year, optional time. */
export function moveInLabel(d: Date, time?: string): string {
  const wd = THAI_WEEKDAY[d.getDay()];
  const be = d.getFullYear() + 543;
  const base = `${wd}ที่ ${d.getDate()} ${THAI_MONTH[d.getMonth()]} ${be}`;
  return time ? `${base} (${time})` : base;
}

/** "30-31 พฤษภาคม" (range) or "15 พฤษภาคม" (single day). */
export function prorateRangeLabel(d: Date, proratedDays: number): string {
  const start = d.getDate();
  const end = start + proratedDays - 1;
  const mon = THAI_MONTH[d.getMonth()];
  return proratedDays > 1 ? `${start}-${end} ${mon}` : `${start} ${mon}`;
}

export interface BookingMessageInput {
  apartmentName: string;
  room: string;
  tenant: string;
  phone: string;
  moveInDate: Date;
  moveInTime?: string;
  calc: BookingCalc;
  pet?: string;
  contractTerms?: string;
}

export function formatBookingMessage(input: BookingMessageInput): string {
  const { apartmentName, room, tenant, phone, moveInDate, moveInTime, calc, pet, contractTerms } = input;
  const nextMonthName = THAI_MONTH[(moveInDate.getMonth() + 1) % 12];

  const lines: string[] = [];
  lines.push("✅ ยืนยันการจองเรียบร้อยค่ะ");
  lines.push(`${apartmentName} ห้อง ${room}`.trim());
  lines.push("");
  lines.push(`🙍 คุณ ${tenant} | ${phone}`.trim());
  lines.push(`📅 เข้าพัก: ${moveInLabel(moveInDate, moveInTime)}`);
  lines.push("");
  lines.push("💰 สรุปยอดวันเข้าพัก");
  if (calc.nextMonthRent > 0) {
    lines.push(`• ค่าห้องรายเดือน${nextMonthName}: ${baht(calc.nextMonthRent)} บาท`);
  }
  lines.push(`• ค่าห้องเฉลี่ย (${prorateRangeLabel(moveInDate, calc.proratedDays)}): ${baht(calc.proratedAmount)} บาท`);
  lines.push(`• ค่าประกัน: ${baht(calc.deposit)} บาท`);
  lines.push("");
  lines.push(`• ยอดรวมทั้งหมด: ${baht(calc.total)} บาท`);
  lines.push(`• ชำระมัดจำแล้ว: -${baht(calc.bookingPaid)} บาท`);
  lines.push(`• ยอดคงเหลือโอนเพิ่ม: ${baht(calc.remaining)} บาท`);

  const extra: string[] = [];
  if (pet && pet.trim()) extra.push(`• สัตว์เลี้ยง : ${pet.trim()}`);
  if (contractTerms && contractTerms.trim()) extra.push(`• เงื่อนไขสัญญา : ${contractTerms.trim()}`);
  if (extra.length) {
    lines.push("");
    lines.push("🐾 ข้อมูลเพิ่มเติม:");
    lines.push(...extra);
  }

  return lines.join("\n");
}
