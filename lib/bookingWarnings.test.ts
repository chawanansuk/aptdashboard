import { describe, expect, it } from "vitest";
import { bookingWarnings, shouldAutoChargeNextMonth } from "./bookingWarnings";

// Fixed clock: Monday 2026-07-20.
const NOW = new Date(2026, 6, 20);

function warnings(dateDay: number, time: string, month = 6): string[] {
  return bookingWarnings({ moveInDate: new Date(2026, month, dateDay), moveInTime: time, now: NOW });
}

describe("bookingWarnings — 4-day prep rule", () => {
  it("warns when the move-in is closer than 4 days", () => {
    expect(warnings(23, "09:00").join()).toContain("เตรียมห้องเร็วสุด 4 วัน");
    expect(warnings(20, "09:00").join()).toContain("เตรียมห้องเร็วสุด 4 วัน"); // same day
  });
  it("stays quiet at exactly 4 days and beyond", () => {
    expect(warnings(24, "09:00")).toEqual([]);
    expect(warnings(30, "09:00")).toEqual([]);
  });
});

describe("bookingWarnings — business hours", () => {
  it("boundaries: 08:29 ✗ · 08:30 ✓ · 12:00 ✓ · 12:01 ✗ · 13:00 ✓ · 17:00 ✓ · 17:01 ✗", () => {
    const out = (t: string) => warnings(30, t).some((w) => w.includes("นอกเวลาทำการ"));
    expect(out("08:29")).toBe(true);
    expect(out("08:30")).toBe(false);
    expect(out("12:00")).toBe(false);
    expect(out("12:01")).toBe(true);
    expect(out("13:00")).toBe(false);
    expect(out("17:00")).toBe(false);
    expect(out("17:01")).toBe(true);
  });
  it("Sunday warns even inside working hours (26 Jul 2026 is a Sunday)", () => {
    expect(warnings(26, "10:00").some((w) => w.includes("นอกเวลาทำการ"))).toBe(true);
  });
  it("no time given → no hours check (date rules still apply)", () => {
    expect(warnings(30, "")).toEqual([]);
  });
});

describe("shouldAutoChargeNextMonth", () => {
  it("day 24 no, day 25 yes", () => {
    expect(shouldAutoChargeNextMonth(new Date(2026, 6, 24))).toBe(false);
    expect(shouldAutoChargeNextMonth(new Date(2026, 6, 25))).toBe(true);
    expect(shouldAutoChargeNextMonth(new Date(2026, 6, 31))).toBe(true);
  });
});
