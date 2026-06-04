/**
 * Booking move-in math (Thai apartment convention).
 *
 * Mirrors the manual calculation staff put in their LINE confirmation:
 * a late-month move-in pays the prorated remainder of the move-in month
 * + one full upcoming month + the security deposit, minus whatever
 * booking deposit was already transferred.
 *
 * Daily rate uses the /30 convention (not the actual month length) —
 * that's what the existing confirmations use: 5,500 / 30 × 2 = 367.
 * All amounts are rounded to whole baht.
 */

export const DAILY_DIVISOR = 30;

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
  const d = input.moveInDate;
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  const day = d.getDate();

  let proratedDays: number;
  let proratedAmount: number;

  if (day <= 1) {
    // Move-in on the 1st: the "prorate" is the whole month (no /30 drift).
    proratedDays = dim;
    proratedAmount = rent;
  } else {
    // Cap at 29 days. In a 31-day month, (dim - day + 1) reaches 30 when
    // day = 2, and 30 days × (rent/30) lands exactly on the full monthly
    // rent — the customer sees "ค่าห้องตามจำนวนวัน (30 วัน) = 5,500" which
    // is indistinguishable from "เก็บเต็มเดือน" even though they didn't
    // use the 1st. A move-in after the 1st is by definition NOT a full
    // month at the /30 rate, so cap at DAILY_DIVISOR - 1 so there's
    // always at least one day of discount visible.
    proratedDays = Math.min(dim - day + 1, DAILY_DIVISOR - 1);
    proratedAmount = Math.round((rent / DAILY_DIVISOR) * proratedDays);
  }

  // The upcoming full month is collected ONLY when staff opt in
  // (chargeNextMonth) — typically late-month move-ins. Default off so an
  // early move-in (e.g. 3rd) doesn't get billed ~2 months up front.
  const nextMonthRent = input.chargeNextMonth ? rent : 0;

  const total = proratedAmount + nextMonthRent + deposit;
  const remaining = total - bookingPaid;
  return { proratedDays, proratedAmount, nextMonthRent, deposit, bookingPaid, total, remaining };
}
