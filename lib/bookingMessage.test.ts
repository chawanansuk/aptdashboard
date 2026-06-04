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
