import type { BookingCalc } from "./bookingMath";
import type { BankAccount } from "./bookingConfig";

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
  lines.push(`• ค่าห้องตามจำนวนวัน (${prorateRangeLabel(moveInDate, calc.proratedDays)}): ${baht(calc.proratedAmount)} บาท`);
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

/* ===== ข้อความ 3 โหมด (P0-5) =====
 *
 * Workflow จริงของแอดมินส่ง 3 ข้อความ: ขอมัดจำ (A) → ยืนยันการจอง (B) →
 * สิ่งที่ต้องเตรียม (C). ทุกโหมดใช้ข้อมูลฟอร์มชุดเดียวกัน.
 *
 * formatBookingMessage (ด้านบน) คือเทมเพลตเดิมที่เทส pin ข้อความไว้เป๊ะ —
 * ห้ามแก้ body; โหมด B (V2) ประกอบใหม่จากถ้อยคำเดิมทุกตัวอักษร + ส่วนเพิ่ม.
 */

export type BookingMessageMode = "A" | "B" | "C";

export interface BookingMessageInputV2 extends BookingMessageInput {
  /** ชื่อเล่นสำหรับเรียกในข้อความ (P1) — เว้นว่าง = ใช้ชื่อผู้เช่า. */
  nickname?: string;
  /** มีเอกสารวัคซีนสัตว์เลี้ยงแล้ว (P1) — ต่อท้ายบรรทัดสัตว์เลี้ยงในโหมด B. */
  vaccineDocumented?: boolean;
  /** บรรทัด chips หมายเหตุเพิ่มเติม (P1) — ต่อท้ายบล็อกข้อมูลเพิ่มเติม. */
  noteChipLines?: string[];
  bank: BankAccount;
}

function displayName(i: BookingMessageInputV2): string {
  return (i.nickname || "").trim() || i.tenant;
}

/** 🏦 บล็อกช่องทางโอน — ใช้ร่วมโหมด A (เต็ม) ส่วน C ใช้แบบย่อบรรทัดเดียว. */
export function bankBlockLines(bank: BankAccount): string[] {
  return [
    "🏦 ช่องทางการโอนเงิน",
    `ธนาคาร: ${bank.bank}`,
    `เลขบัญชี: ${bank.accountNo}`,
    `ชื่อบัญชี: ${bank.accountName}`,
  ];
}

/** โหมด A — ขอมัดจำ (ส่งก่อนได้เงิน จึงไม่มียอดรวม/คงเหลือ). */
export function formatDepositRequestMessage(i: BookingMessageInputV2): string {
  const lines: string[] = [];
  lines.push(`📌 จองห้องพัก : ${i.apartmentName} (ห้อง ${i.room}) ราคา ${baht(i.calc.monthlyRent)} บาท`);
  lines.push(`เพื่อให้การจองสมบูรณ์ รบกวนคุณ ${displayName(i)} โอนมัดจำจองไว้ก่อนนะคะ`);
  lines.push("");
  lines.push(`💰 ยอดมัดจำ: ${baht(i.calc.bookingPaid)} บาท`);
  lines.push("(ยอดนี้จะนำไปหักลบกับค่าใช้จ่ายวันเข้าพักค่ะ)");
  lines.push("");
  lines.push(...bankBlockLines(i.bank));
  lines.push("");
  lines.push("รบกวนส่งสลิปยืนยันเพื่อล็อคห้องพักให้ทันทีนะคะ");
  return lines.join("\n");
}

/**
 * โหมด B — ยืนยันการจอง: เทมเพลตเดิมทุกตัวอักษร + ส่วนเพิ่ม:
 *  - บรรทัดค่าเช่ารายเดือนเป็น "ข้อมูลแนบบน" หลังบรรทัด 📅 (มติเจ้าของ —
 *    ไม่ใส่ในบล็อก 💰 เพราะยอดนั้นไม่ได้บวกในยอดรวม ลูกค้าจะอ่านผิด)
 *  - suffix เอกสารวัคซีนบนบรรทัดสัตว์เลี้ยง (เมื่อติ๊ก)
 *  - บรรทัด chips หมายเหตุต่อท้ายบล็อกข้อมูลเพิ่มเติม
 */
export function formatBookingMessageV2(i: BookingMessageInputV2): string {
  const { apartmentName, room, tenant, phone, moveInDate, moveInTime, calc, pet, contractTerms } = i;
  const nextMonthName = THAI_MONTH[(moveInDate.getMonth() + 1) % 12];

  const lines: string[] = [];
  lines.push("✅ ยืนยันการจองเรียบร้อยค่ะ");
  lines.push(`${apartmentName} ห้อง ${room}`.trim());
  lines.push("");
  lines.push(`🙍 คุณ ${tenant} | ${phone}`.trim());
  lines.push(`📅 เข้าพัก: ${moveInLabel(moveInDate, moveInTime)}`);
  if (calc.monthlyRent > 0) {
    lines.push(`• ค่าเช่ารายเดือน: ${baht(calc.monthlyRent)} บาท/เดือน`);
  }
  lines.push("");
  lines.push("💰 สรุปยอดวันเข้าพัก");
  if (calc.nextMonthRent > 0) {
    lines.push(`• ค่าห้องรายเดือน${nextMonthName}: ${baht(calc.nextMonthRent)} บาท`);
  }
  lines.push(`• ค่าห้องตามจำนวนวัน (${prorateRangeLabel(moveInDate, calc.proratedDays)}): ${baht(calc.proratedAmount)} บาท`);
  lines.push(`• ค่าประกัน: ${baht(calc.deposit)} บาท`);
  lines.push("");
  lines.push(`• ยอดรวมทั้งหมด: ${baht(calc.total)} บาท`);
  lines.push(`• ชำระมัดจำแล้ว: -${baht(calc.bookingPaid)} บาท`);
  lines.push(`• ยอดคงเหลือโอนเพิ่ม: ${baht(calc.remaining)} บาท`);

  const extra: string[] = [];
  if (pet && pet.trim()) {
    const vaccine = i.vaccineDocumented ? " มีเอกสารยืนยันการฉีดวัคซีนแล้ว" : "";
    extra.push(`• สัตว์เลี้ยง : ${pet.trim()}${vaccine}`);
  }
  if (contractTerms && contractTerms.trim()) extra.push(`• เงื่อนไขสัญญา : ${contractTerms.trim()}`);
  if (i.noteChipLines?.length) extra.push(...i.noteChipLines);
  if (extra.length) {
    lines.push("");
    lines.push("🐾 ข้อมูลเพิ่มเติม:");
    lines.push(...extra);
  }

  return lines.join("\n");
}

/** โหมด C — สิ่งที่ต้องเตรียมก่อนวันเข้าพัก (ยอดคงเหลือ + บัญชีแบบย่อ). */
export function formatPrepareMessage(i: BookingMessageInputV2): string {
  const lines: string[] = [];
  lines.push("📄 สิ่งที่ต้องเตรียม");
  lines.push("1. สำเนาบัตรประชาชน");
  lines.push(`2. ยอดโอนส่วนที่เหลือ ${baht(i.calc.remaining)} บาท`);
  lines.push("");
  lines.push("โอนยอดส่วนที่เหลือเข้าบัญชีเดิมได้เลยค่ะ");
  lines.push(`🏦 ${i.bank.bank}: ${i.bank.accountNo} ${i.bank.accountName}`);
  lines.push("");
  lines.push("⏰ ก่อนถึงวันเข้าพัก รบกวนแจ้งเวลาที่สะดวกล่วงหน้า 1 วันนะคะ");
  lines.push("");
  lines.push("มีอะไรสอบถามเพิ่มเติม ทักมาได้ตลอดเลยนะคะ");
  return lines.join("\n");
}

export function formatMessageForMode(mode: BookingMessageMode, i: BookingMessageInputV2): string {
  if (mode === "A") return formatDepositRequestMessage(i);
  if (mode === "C") return formatPrepareMessage(i);
  return formatBookingMessageV2(i);
}
