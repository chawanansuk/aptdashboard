import { describe, it, expect } from "vitest";
import { computeBooking } from "./bookingMath";
import { formatBookingMessage, moveInLabel, prorateRangeLabel } from "./bookingMessage";

describe("moveInLabel", () => {
  it("formats Thai weekday + Buddhist year + time", () => {
    // 30 May 2026 is a Saturday.
    expect(moveInLabel(new Date(2026, 4, 30), "09:00")).toBe("เสาร์ที่ 30 พฤษภาคม 2569 (09:00)");
  });
  it("omits time when not given", () => {
    expect(moveInLabel(new Date(2026, 4, 30))).toBe("เสาร์ที่ 30 พฤษภาคม 2569");
  });
});

describe("prorateRangeLabel", () => {
  it("renders a range for multiple days", () => {
    expect(prorateRangeLabel(new Date(2026, 4, 30), 2)).toBe("30-31 พฤษภาคม");
  });
  it("renders a single day", () => {
    expect(prorateRangeLabel(new Date(2026, 4, 31), 1)).toBe("31 พฤษภาคม");
  });
  it("renders the real stay range for a 2-Jul move-in (30 days, 2-31)", () => {
    // Companion to computeBooking's /dim divisor: days charged now equals
    // days actually used, so the label can show the customer's true stay.
    expect(prorateRangeLabel(new Date(2026, 6, 2), 30)).toBe("2-31 กรกฎาคม");
  });
});

describe("formatBookingMessage", () => {
  const calc = computeBooking({
    monthlyRent: 5500,
    moveInDate: new Date(2026, 4, 30),
    deposit: 10000,
    bookingPaid: 5500,
    chargeNextMonth: true,
  });
  const msg = formatBookingMessage({
    apartmentName: "มีทอง เรสซิเด้นท์",
    room: "410",
    tenant: "คุณพู",
    phone: "091-6554938",
    moveInDate: new Date(2026, 4, 30),
    moveInTime: "09:00",
    calc,
    pet: "น้องแมว 1 ตัว (มาเบล) มีเอกสารยืนยันการฉีดวัคซีนแล้ว",
    contractTerms: "ขั้นต่ำ 6 เดือนขึ้นไป",
  });

  it("contains the headline + room", () => {
    expect(msg).toContain("✅ ยืนยันการจองเรียบร้อยค่ะ");
    expect(msg).toContain("มีทอง เรสซิเด้นท์ ห้อง 410");
  });
  it("contains tenant + phone + move-in line", () => {
    expect(msg).toContain("🙍 คุณ คุณพู | 091-6554938");
    expect(msg).toContain("📅 เข้าพัก: เสาร์ที่ 30 พฤษภาคม 2569 (09:00)");
  });
  it("contains the money breakdown matching the real confirmation", () => {
    expect(msg).toContain("• ค่าห้องรายเดือนมิถุนายน: 5,500 บาท");
    expect(msg).toContain("• ค่าห้องตามจำนวนวัน (30-31 พฤษภาคม): 355 บาท");
    expect(msg).toContain("• ค่าประกัน: 10,000 บาท");
    expect(msg).toContain("• ยอดรวมทั้งหมด: 15,855 บาท");
    expect(msg).toContain("• ชำระมัดจำแล้ว: -5,500 บาท");
    expect(msg).toContain("• ยอดคงเหลือโอนเพิ่ม: 10,355 บาท");
  });
  it("contains the extra info block", () => {
    expect(msg).toContain("🐾 ข้อมูลเพิ่มเติม:");
    expect(msg).toContain("• สัตว์เลี้ยง : น้องแมว 1 ตัว (มาเบล) มีเอกสารยืนยันการฉีดวัคซีนแล้ว");
    expect(msg).toContain("• เงื่อนไขสัญญา : ขั้นต่ำ 6 เดือนขึ้นไป");
  });

  it("omits the next-month line for a 1st-of-month move-in", () => {
    const c2 = computeBooking({ monthlyRent: 6000, moveInDate: new Date(2026, 5, 1), deposit: 6000, bookingPaid: 0 });
    const m2 = formatBookingMessage({
      apartmentName: "ตึก A", room: "101", tenant: "ก", phone: "0800000000",
      moveInDate: new Date(2026, 5, 1), calc: c2,
    });
    expect(m2).not.toContain("ค่าห้องรายเดือน");
    expect(m2).toContain("ค่าห้องตามจำนวนวัน");
  });

  it("omits the extra block when no pet/contract", () => {
    const m3 = formatBookingMessage({
      apartmentName: "ตึก A", room: "101", tenant: "ก", phone: "0800000000",
      moveInDate: new Date(2026, 4, 30), calc,
    });
    expect(m3).not.toContain("ข้อมูลเพิ่มเติม");
  });
});

/* ===== ข้อความ 3 โหมด (P0-5) ===== */

import {
  formatDepositRequestMessage,
  formatBookingMessageV2,
  formatPrepareMessage,
  formatMessageForMode,
  bankBlockLines,
  type BookingMessageInputV2,
} from "./bookingMessage";
import { DEFAULT_BANK } from "./bookingConfig";

// เคสจริงห้อง 401: ค่าเช่า 5,200 เข้า 30 ก.ค. 2026 (31 วัน → 2 วัน = 335)
// ติ๊กเก็บเดือนถัดไป + ประกัน 10,000 + มัดจำ = ค่าเช่า → รวม 15,535 เหลือ 10,335
function mkInput(over: Partial<BookingMessageInputV2> = {}): BookingMessageInputV2 {
  const calc = computeBooking({
    monthlyRent: 5200,
    moveInDate: new Date(2026, 6, 30),
    deposit: 10000,
    bookingPaid: 5200,
    chargeNextMonth: true,
  });
  return {
    apartmentName: "มีทอง เรสซิเด้นท์",
    room: "401",
    tenant: "กุ๊กไก่",
    phone: "092-4561642",
    moveInDate: new Date(2026, 6, 30),
    moveInTime: "10:30",
    calc,
    pet: "",
    contractTerms: "ขั้นต่ำ 6 เดือนขึ้นไป",
    bank: DEFAULT_BANK,
    ...over,
  };
}

describe("owner acceptance cases (real numbers already sent to customers)", () => {
  it("ห้อง 401: 5,200 เข้า 30 ก.ค. + เดือนถัดไป → 335+5,200+10,000 = 15,535 เหลือ 10,335", () => {
    const c = mkInput().calc;
    expect(c.proratedAmount).toBe(335);
    expect(c.total).toBe(15535);
    expect(c.remaining).toBe(10335);
  });
  it("ห้อง 502: 5,000 เข้า 31 ก.ค. + เดือนถัดไป → 161+5,000+10,000 = 15,161 เหลือ 10,161", () => {
    const c = computeBooking({
      monthlyRent: 5000, moveInDate: new Date(2026, 6, 31),
      deposit: 10000, bookingPaid: 5000, chargeNextMonth: true,
    });
    expect(c.proratedAmount).toBe(161);
    expect(c.total).toBe(15161);
    expect(c.remaining).toBe(10161);
  });
  it("ห้อง 501: 5,200 เข้า 20 ส.ค. ไม่ติ๊ก → 2,013+10,000 = 12,013 เหลือ 6,813", () => {
    const c = computeBooking({
      monthlyRent: 5200, moveInDate: new Date(2026, 7, 20),
      deposit: 10000, bookingPaid: 5200, chargeNextMonth: false,
    });
    expect(c.proratedAmount).toBe(2013);
    expect(c.total).toBe(12013);
    expect(c.remaining).toBe(6813);
  });
});

describe("bankBlockLines", () => {
  it("renders the full transfer block", () => {
    expect(bankBlockLines(DEFAULT_BANK)).toEqual([
      "🏦 ช่องทางการโอนเงิน",
      "ธนาคาร: กรุงไทย",
      "เลขบัญชี: 017-0-46047-9",
      "ชื่อบัญชี: บริษัท ม.ทวีทอง จำกัด",
    ]);
  });
});

describe("โหมด A — ขอมัดจำ", () => {
  const msg = formatDepositRequestMessage(mkInput());

  it("matches the spec template exactly", () => {
    expect(msg).toBe([
      "📌 จองห้องพัก : มีทอง เรสซิเด้นท์ (ห้อง 401) ราคา 5,200 บาท",
      "เพื่อให้การจองสมบูรณ์ รบกวนคุณ กุ๊กไก่ โอนมัดจำจองไว้ก่อนนะคะ",
      "",
      "💰 ยอดมัดจำ: 5,200 บาท",
      "(ยอดนี้จะนำไปหักลบกับค่าใช้จ่ายวันเข้าพักค่ะ)",
      "",
      "🏦 ช่องทางการโอนเงิน",
      "ธนาคาร: กรุงไทย",
      "เลขบัญชี: 017-0-46047-9",
      "ชื่อบัญชี: บริษัท ม.ทวีทอง จำกัด",
      "",
      "รบกวนส่งสลิปยืนยันเพื่อล็อคห้องพักให้ทันทีนะคะ",
    ].join("\n"));
  });

  it("uses the nickname when provided (falls back to tenant)", () => {
    expect(formatDepositRequestMessage(mkInput({ nickname: "ไก่" }))).toContain("รบกวนคุณ ไก่ โอนมัดจำ");
    expect(msg).toContain("รบกวนคุณ กุ๊กไก่ โอนมัดจำ");
  });

  it("never shows total/remaining (no money received yet)", () => {
    expect(msg).not.toContain("ยอดรวม");
    expect(msg).not.toContain("คงเหลือ");
  });
});

describe("โหมด B — ยืนยันการจอง (V2)", () => {
  const msg = formatBookingMessageV2(mkInput({ pet: "น้องแมว 1 ตัว" }));

  it("keeps every line of the legacy template", () => {
    expect(msg).toContain("✅ ยืนยันการจองเรียบร้อยค่ะ");
    expect(msg).toContain("มีทอง เรสซิเด้นท์ ห้อง 401");
    expect(msg).toContain("🙍 คุณ กุ๊กไก่ | 092-4561642");
    expect(msg).toContain("📅 เข้าพัก: พฤหัสบดีที่ 30 กรกฎาคม 2569 (10:30)");
    expect(msg).toContain("💰 สรุปยอดวันเข้าพัก");
    expect(msg).toContain("• ค่าห้องรายเดือนสิงหาคม: 5,200 บาท");
    expect(msg).toContain("• ค่าห้องตามจำนวนวัน (30-31 กรกฎาคม): 335 บาท");
    expect(msg).toContain("• ค่าประกัน: 10,000 บาท");
    expect(msg).toContain("• ยอดรวมทั้งหมด: 15,535 บาท");
    expect(msg).toContain("• ชำระมัดจำแล้ว: -5,200 บาท");
    expect(msg).toContain("• ยอดคงเหลือโอนเพิ่ม: 10,335 บาท");
    expect(msg).toContain("• เงื่อนไขสัญญา : ขั้นต่ำ 6 เดือนขึ้นไป");
  });

  it("adds the monthly-rent INFO line after 📅, outside the totals block (owner decision)", () => {
    const lines = msg.split("\n");
    const dateIdx = lines.findIndex((l) => l.startsWith("📅"));
    expect(lines[dateIdx + 1]).toBe("• ค่าเช่ารายเดือน: 5,200 บาท/เดือน");
    // Totals block still opens after it — the info line is NOT a charge row.
    expect(lines.indexOf("💰 สรุปยอดวันเข้าพัก")).toBeGreaterThan(dateIdx + 1);
  });

  it("appends the vaccine confirmation only when documented", () => {
    expect(msg).toContain("• สัตว์เลี้ยง : น้องแมว 1 ตัว");
    expect(msg).not.toContain("มีเอกสารยืนยันการฉีดวัคซีนแล้ว");
    const withDoc = formatBookingMessageV2(mkInput({ pet: "น้องแมว 1 ตัว", vaccineDocumented: true }));
    expect(withDoc).toContain("• สัตว์เลี้ยง : น้องแมว 1 ตัว มีเอกสารยืนยันการฉีดวัคซีนแล้ว");
  });

  it("appends note-chip lines to the extra-info block", () => {
    const withChips = formatBookingMessageV2(mkInput({
      noteChipLines: ["• ที่จอดมอเตอร์ไซค์ในร่ม +200 บาท/เดือน"],
    }));
    expect(withChips).toContain("🐾 ข้อมูลเพิ่มเติม:");
    expect(withChips).toContain("• ที่จอดมอเตอร์ไซค์ในร่ม +200 บาท/เดือน");
  });
});

describe("โหมด C — สิ่งที่ต้องเตรียม", () => {
  it("matches the spec template exactly (bank + remaining)", () => {
    expect(formatPrepareMessage(mkInput())).toBe([
      "📄 สิ่งที่ต้องเตรียม",
      "1. สำเนาบัตรประชาชน",
      "2. ยอดโอนส่วนที่เหลือ 10,335 บาท",
      "",
      "โอนยอดส่วนที่เหลือเข้าบัญชีเดิมได้เลยค่ะ",
      "🏦 กรุงไทย: 017-0-46047-9 บริษัท ม.ทวีทอง จำกัด",
      "",
      "⏰ ก่อนถึงวันเข้าพัก รบกวนแจ้งเวลาที่สะดวกล่วงหน้า 1 วันนะคะ",
      "",
      "มีอะไรสอบถามเพิ่มเติม ทักมาได้ตลอดเลยนะคะ",
    ].join("\n"));
  });
});

describe("formatMessageForMode", () => {
  it("routes to the right template per mode", () => {
    const i = mkInput();
    expect(formatMessageForMode("A", i)).toContain("📌 จองห้องพัก");
    expect(formatMessageForMode("B", i)).toContain("✅ ยืนยันการจอง");
    expect(formatMessageForMode("C", i)).toContain("📄 สิ่งที่ต้องเตรียม");
  });
});
