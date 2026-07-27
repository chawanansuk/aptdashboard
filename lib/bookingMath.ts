/**
 * Booking move-in math (Thai apartment convention).
 *
 * Mirrors the manual calculation staff put in their LINE confirmation:
 * a late-month move-in pays the prorated remainder of the move-in month
 * + one full upcoming month + the security deposit, minus whatever
 * booking deposit was already transferred.
 *
 * Daily rate uses the ACTUAL month length (rent/dim × days). The earlier
 * /30 convention was simpler but had a stealth-full-month edge case
 * (move-in on the 2nd of a 31-day month → 30 days × rent/30 = full
 * rent), and the customer-facing label had to undercount the stay days
 * to compensate ("2-30 กรกฎาคม" while they actually stay 2-31). Dividing
 * by `dim` makes "days charged" = "days actually used" so the LINE
 * label can show the real range. Amounts in 28- and 31-day months shift
 * a few percent vs. the old /30 figure — 30-day months are unchanged.
 * All amounts are rounded to whole baht.
 */

import type { ProrateMode } from "./bookingConfig";

export interface BookingInput {
  /** Monthly rent in baht. */
  monthlyRent: number;
  /** Move-in date (CE / Gregorian). */
  moveInDate: Date;
  /** Security deposit / ค่าประกัน in baht. */
  deposit: number;
  /** Booking deposit already paid (มัดจำ) in baht. */
  bookingPaid: number;
  /**
   * Collect the full UPCOMING month up front, on top of the prorated
   * move-in month. Staff decide per booking — typically only for
   * late-month move-ins (few days left), NOT early-month ones (where
   * charging the next month means ~2 months up front). Defaults false.
   */
  chargeNextMonth?: boolean;
  /**
   * Divisor rule for the daily rate (P1-3). Default "actual-days" —
   * the behavior documented above. "fixed-30"/"fixed-31" divide by a
   * constant instead (days charged stay the ACTUAL remaining days).
   */
  prorateMode?: ProrateMode;
  /** One-off adjustment/discount in baht (P1-3); subtracted from total. */
  discount?: number;
}

export interface BookingCalc {
  /** Days charged in the move-in month (inclusive of the move-in day). */
  proratedDays: number;
  /** Prorated rent for the move-in month. */
  proratedAmount: number;
  /** Full upcoming month rent collected up front (0 unless chargeNextMonth). */
  nextMonthRent: number;
  deposit: number;
  bookingPaid: number;
  /** proratedAmount + nextMonthRent + deposit. */
  total: number;
  /** total − bookingPaid (can be negative if overpaid). */
  remaining: number;
  /** Rounded monthly rent echoed back — the V2 messages show it as an
   *  info line ("ค่าเช่ารายเดือน: X บาท/เดือน"). */
  monthlyRent: number;
  /** Discount applied (0 when none). */
  discount: number;
  /** The divisor the daily rate used — shown in the formula caption. */
  prorateDivisor: number;
}

function toMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function computeBooking(input: BookingInput): BookingCalc {
  const rent = toMoney(input.monthlyRent);
  const deposit = toMoney(input.deposit);
  const bookingPaid = toMoney(input.bookingPaid);
  const discount = toMoney(input.discount ?? 0);
  const d = input.moveInDate;
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  const day = d.getDate();
  const mode = input.prorateMode ?? "actual-days";
  const divisor = mode === "fixed-30" ? 30 : mode === "fixed-31" ? 31 : dim;

  let proratedDays: number;
  let proratedAmount: number;

  if (day <= 1) {
    // Move-in on the 1st: the whole month (no rounding drift), no
    // matter the divisor convention.
    proratedDays = dim;
    proratedAmount = rent;
  } else {
    proratedDays = dim - day + 1;
    proratedAmount = Math.round((rent / divisor) * proratedDays);
  }

  // The upcoming full month is collected ONLY when staff opt in
  // (chargeNextMonth) — typically late-month move-ins. Default off so an
  // early move-in (e.g. 3rd) doesn't get billed ~2 months up front.
  const nextMonthRent = input.chargeNextMonth ? rent : 0;

  const total = proratedAmount + nextMonthRent + deposit - discount;
  const remaining = total - bookingPaid;
  return {
    proratedDays, proratedAmount, nextMonthRent, deposit, bookingPaid,
    total, remaining, monthlyRent: rent, discount, prorateDivisor: divisor,
  };
}
