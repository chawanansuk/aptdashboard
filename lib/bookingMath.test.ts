import { describe, it, expect } from "vitest";
import { computeBooking, daysInMonth } from "./bookingMath";

describe("computeBooking", () => {
  it("matches the real confirmation (30 May, rent 5500, deposit 10000, paid 5500)", () => {
    // The screenshot booking: move-in Sat 30 May 2026.
    const c = computeBooking({
      monthlyRent: 5500,
      moveInDate: new Date(2026, 4, 30), // May = index 4
      deposit: 10000,
      bookingPaid: 5500,
    });
    expect(c.proratedDays).toBe(2); // 30, 31 May
    expect(c.proratedAmount).toBe(367); // 5500/30*2 = 366.67 → 367
    expect(c.nextMonthRent).toBe(5500); // full June
    expect(c.total).toBe(15867); // 5500 + 367 + 10000
    expect(c.remaining).toBe(10367); // 15867 - 5500
  });

  it("handles a 1st-of-month move-in as a full month, no next-month charge", () => {
    const c = computeBooking({
      monthlyRent: 6000,
      moveInDate: new Date(2026, 5, 1), // 1 June
      deposit: 6000,
      bookingPaid: 0,
    });
    expect(c.proratedDays).toBe(30); // June has 30 days
    expect(c.proratedAmount).toBe(6000); // full month, not 6000/30*30 rounding drift
    expect(c.nextMonthRent).toBe(0);
    expect(c.total).toBe(12000); // 6000 + 0 + 6000
    expect(c.remaining).toBe(12000);
  });

  it("prorates a single last day", () => {
    const c = computeBooking({
      monthlyRent: 9000,
      moveInDate: new Date(2026, 0, 31), // 31 Jan
      deposit: 0,
      bookingPaid: 0,
    });
    expect(c.proratedDays).toBe(1);
    expect(c.proratedAmount).toBe(300); // 9000/30*1
    expect(c.nextMonthRent).toBe(9000);
    expect(c.total).toBe(9300);
  });

  it("remaining can go negative when overpaid", () => {
    const c = computeBooking({
      monthlyRent: 5000,
      moveInDate: new Date(2026, 4, 15),
      deposit: 5000,
      bookingPaid: 20000,
    });
    expect(c.remaining).toBeLessThan(0);
  });

  it("coerces garbage/negative inputs to 0", () => {
    const c = computeBooking({
      monthlyRent: NaN,
      moveInDate: new Date(2026, 4, 15),
      deposit: -100,
      bookingPaid: NaN,
    });
    expect(c.proratedAmount).toBe(0);
    expect(c.deposit).toBe(0);
    expect(c.bookingPaid).toBe(0);
  });

  it("daysInMonth handles leap February", () => {
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2026, 1)).toBe(28);
  });
});
