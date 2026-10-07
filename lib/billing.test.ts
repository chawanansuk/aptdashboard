import { describe, expect, it } from "vitest";
import {
  billMessage, computeBill, currentMonthKey, dueDateOf, isMonthKey, monthLabel,
  parseReading, shiftMonth, summarize, type BillingRate,
} from "./billing";

const RATE: BillingRate = { building: "มั่งมี", elecRate: 8, waterRate: 18, waterMin: 100, dueDay: 5 };
const input = { elecPrev: 1234, elecCur: 1290, waterPrev: 50, waterCur: 56, rent: 4500 };

describe("computeBill", () => {
  it("rent + units × rate, whole baht, water minimum applies", () => {
    const b = computeBill(input, RATE);
    expect(b).toMatchObject({ elecUnits: 56, elecCost: 448, waterUnits: 6, waterCost: 108, total: 5056, problems: [] });
    const low = computeBill({ ...input, waterCur: 52 }, RATE);
    expect(low.waterCost).toBe(100); // 2 × 18 = 36 → minimum 100
    expect(computeBill({ ...input, elecCur: 1290.5 }, { ...RATE, elecRate: 8.5 }).elecCost).toBe(480); // 56.5 × 8.5 = 480.25
  });

  it("extras are added; flat water (rate 0 + minimum) needs no water reading", () => {
    const b = computeBill({ ...input, waterPrev: null, waterCur: null, parking: 200, other: 50 }, { ...RATE, waterRate: 0, waterMin: 150 });
    expect(b.waterCost).toBe(150);
    expect(b.total).toBe(4500 + 448 + 150 + 250);
  });

  it("never invents a total: no rate, a missing reading, a meter that went backwards", () => {
    const noRate = computeBill(input, null);
    expect(noRate.total).toBeNull();
    expect(noRate.problems.join()).toContain("ยังไม่ได้ตั้งอัตรา");
    const missing = computeBill({ ...input, waterCur: null }, RATE);
    expect(missing.total).toBeNull();
    expect(missing.problems).toContain("ยังไม่ได้จดมิเตอร์น้ำ");
    const back = computeBill({ ...input, elecCur: 1200 }, RATE);
    expect(back.elecUnits).toBeNull();
    expect(back.total).toBeNull();
    expect(back.problems.join()).toContain("น้อยกว่าเดิม");
    expect(back.problems).not.toContain("ยังไม่ได้จดมิเตอร์ไฟ"); // one message, the real one
    expect(computeBill({ ...input, rent: null }, RATE).total).toBeNull();
  });
});

describe("months", () => {
  it("shift, label, validate, Bangkok 'now', due date clamped to month length", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthLabel("2026-10")).toBe("ต.ค. 2569");
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-09")).toBe(true);
    expect(currentMonthKey(new Date("2026-09-30T18:00:00Z"))).toBe("2026-10"); // already 1 Oct in Bangkok
    const due = dueDateOf("2026-10", 5)!;
    expect([due.getFullYear(), due.getMonth() + 1, due.getDate()]).toEqual([2026, 11, 5]);
    const clamped = dueDateOf("2026-10", 31)!;
    expect(clamped.getDate()).toBe(30); // November has 30 days
  });

  it("parseReading takes what people type", () => {
    expect(parseReading("1,234.5")).toBe(1234.5);
    expect(parseReading("")).toBeNull();
    expect(parseReading("abc")).toBeNull();
    expect(parseReading("-3")).toBeNull();
    expect(parseReading(77)).toBe(77);
  });
});

describe("billMessage", () => {
  it("lists each charge with its working, the total, due date and the building's account", () => {
    const bill = computeBill({ ...input, parking: 200 }, RATE);
    const text = billMessage({
      month: "2026-10", room: "104", apartmentName: "หอพักมั่งมีทวีสุข",
      input: { ...input, parking: 200 }, bill, rate: RATE,
      bank: { bank: "กรุงไทย", accountNo: "043-0-24123-2", accountName: "นายทดสอบ" },
    });
    expect(text).toContain("บิลรอบ ต.ค. 2569 — ห้อง 104");
    expect(text).toContain("ค่าเช่า 4,500 บาท");
    expect(text).toContain("56 หน่วย × 8 = 448 บาท");
    expect(text).toContain("ค่าจอดรถ 200 บาท");
    expect(text).toContain("รวม 5,256 บาท");
    expect(text).toContain("5 พ.ย. 2569");
    expect(text).toContain("กรุงไทย 043-0-24123-2");
  });

  it("an amount typed into the sheet by hand is sent plain, without a sum that doesn't add up", () => {
    const bill = { ...computeBill(input, RATE), elecCost: 500, total: 5108 };
    const text = billMessage({
      month: "2026-10", room: "104", apartmentName: "หอ", input, bill, rate: RATE,
      bank: { bank: "กรุงไทย", accountNo: "1", accountName: "ก" },
    });
    expect(text).toContain("ค่าไฟ 500 บาท");
    expect(text).not.toContain("× 8");
    expect(text).toContain("หน่วย × 18"); // water still adds up → working shown
  });
});

describe("summarize", () => {
  it("counts only rooms with a total; paid = has a transfer date", () => {
    expect(summarize([
      { total: 5000, paidDate: "2026-11-02" },
      { total: 4000, paidDate: "" },
      { total: null, paidDate: "" },
    ])).toEqual({ billed: 9000, collected: 5000, outstanding: 4000, rooms: 2, paidRooms: 1 });
  });
});
