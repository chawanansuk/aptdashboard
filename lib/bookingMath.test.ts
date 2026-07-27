import { describe, it, expect } from "vitest";
import { computeBooking, daysInMonth } from "./bookingMath";

describe("computeBooking", () => {
  it("late move-in WITH chargeNextMonth (30 May, rent 5500, deposit 10000, paid 5500)", () => {
    // The screenshot booking: move-in Sat 30 May 2026, staff opted to
    // collect June up front (late-month move-in).
    const c = computeBooking({
      monthlyRent: 5500,
      moveInDate: new Date(2026, 4, 30), // May = index 4
      deposit: 10000,
      bookingPaid: 5500,
      chargeNextMonth: true,
    });
    expect(c.proratedDays).toBe(2); // 30, 31 May
    expect(c.proratedAmount).toBe(355); // 5500/31*2 = 354.84 → 355
    expect(c.nextMonthRent).toBe(5500); // full June, opted in
    expect(c.total).toBe(15855); // 5500 + 355 + 10000
    expect(c.remaining).toBe(10355); // 15855 - 5500
  });

  it("early move-in does NOT charge next month by default (3 June)", () => {
    // The reported bug: 3 June was billing July too. Default (no
    // chargeNextMonth) must only prorate June + deposit.
    const c = computeBooking({
      monthlyRent: 5500,
      moveInDate: new Date(2026, 5, 3), // 3 June
      deposit: 10000,
      bookingPaid: 5500,
    });
    expect(c.proratedDays).toBe(28); // 3..30 June
    expect(c.proratedAmount).toBe(5133); // 5500/30*28 = 5133.3 → 5133 (June dim=30, no change)
    expect(c.nextMonthRent).toBe(0); // NOT charged
    expect(c.total).toBe(15133); // 5133 + 0 + 10000
    expect(c.remaining).toBe(9633);
  });

  it("same early move-in CAN charge next month when staff opts in", () => {
    const c = computeBooking({
      monthlyRent: 5500,
      moveInDate: new Date(2026, 5, 3),
      deposit: 10000,
      bookingPaid: 5500,
      chargeNextMonth: true,
    });
    expect(c.nextMonthRent).toBe(5500);
    expect(c.total).toBe(20633); // 5133 + 5500 + 10000
  });

  it("2nd-of-31-day-month move-in charges the real 30 days at /dim — not a stealth full month", () => {
    // Reported bug: ย้ายเข้า 2 ก.ค. The old /30 convention gave 30 ×
    // (5500/30) = 5500 (= a full month) for a stay of 2-31 July. Dividing
    // by the month's actual length keeps "days charged" honest: 30 real
    // days × (rent / 31) is visibly less than the monthly rate.
    const c = computeBooking({
      monthlyRent: 5500,
      moveInDate: new Date(2026, 6, 2), // 2 July
      deposit: 0,
      bookingPaid: 0,
    });
    expect(c.proratedDays).toBe(30); // 2..31 July
    expect(c.proratedAmount).toBe(5323); // 5500/31*30 = 5322.58 → 5323
    expect(c.proratedAmount).toBeLessThan(5500);
  });

  it("handles a 1st-of-month move-in as a full month", () => {
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

  it("prorates a single last day (with next month opted in)", () => {
    const c = computeBooking({
      monthlyRent: 9000,
      moveInDate: new Date(2026, 0, 31), // 31 Jan
      deposit: 0,
      bookingPaid: 0,
      chargeNextMonth: true,
    });
    expect(c.proratedDays).toBe(1);
    expect(c.proratedAmount).toBe(290); // 9000/31*1 = 290.32 → 290
    expect(c.nextMonthRent).toBe(9000);
    expect(c.total).toBe(9290);
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

/* ===== P1-3: prorate modes + discount ===== */

describe("prorateMode (P1-3)", () => {
  it("fixed-30: divisor 30, days stay ACTUAL remaining days", () => {
    // 30 ก.ค. (31-day month) → 2 real days, but divided by 30.
    const c = computeBooking({
      monthlyRent: 5200, moveInDate: new Date(2026, 6, 30),
      deposit: 0, bookingPaid: 0, prorateMode: "fixed-30",
    });
    expect(c.proratedDays).toBe(2);
    expect(c.prorateDivisor).toBe(30);
    expect(c.proratedAmount).toBe(Math.round((5200 / 30) * 2)); // 347
  });

  it("fixed-31: divisor 31 in a 30-day month", () => {
    const c = computeBooking({
      monthlyRent: 6000, moveInDate: new Date(2026, 8, 21), // ก.ย. = 30 วัน → 10 วัน
      deposit: 0, bookingPaid: 0, prorateMode: "fixed-31",
    });
    expect(c.proratedDays).toBe(10);
    expect(c.proratedAmount).toBe(Math.round((6000 / 31) * 10)); // 1935
  });

  it("move-in on the 1st is a full month under EVERY mode", () => {
    for (const prorateMode of ["actual-days", "fixed-30", "fixed-31"] as const) {
      const c = computeBooking({
        monthlyRent: 5200, moveInDate: new Date(2026, 6, 1),
        deposit: 0, bookingPaid: 0, prorateMode,
      });
      expect(c.proratedAmount).toBe(5200);
    }
  });

  it("default mode stays actual-days (existing behavior untouched)", () => {
    const c = computeBooking({
      monthlyRent: 5200, moveInDate: new Date(2026, 6, 30),
      deposit: 0, bookingPaid: 0,
    });
    expect(c.prorateDivisor).toBe(31);
    expect(c.proratedAmount).toBe(335);
  });
});

describe("discount (P1-3)", () => {
  it("flows into total and remaining", () => {
    const c = computeBooking({
      monthlyRent: 5200, moveInDate: new Date(2026, 6, 30),
      deposit: 10000, bookingPaid: 5200, chargeNextMonth: true, discount: 500,
    });
    expect(c.discount).toBe(500);
    expect(c.total).toBe(15035);      // 15,535 - 500
    expect(c.remaining).toBe(9835);   // 10,335 - 500
  });

  it("absent/zero discount changes nothing", () => {
    const base = computeBooking({
      monthlyRent: 5200, moveInDate: new Date(2026, 6, 30),
      deposit: 10000, bookingPaid: 5200, chargeNextMonth: true,
    });
    expect(base.discount).toBe(0);
    expect(base.total).toBe(15535);
  });
});
