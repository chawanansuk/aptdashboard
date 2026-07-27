import {
  AUTO_CHARGE_NEXT_MONTH_FROM_DAY,
  BUSINESS_HOURS,
  MIN_PREP_DAYS,
} from "@/lib/bookingConfig";

/**
 * Booking-form warnings (P1-2) — advisory only, NEVER gates save/copy.
 * Walk-in customers exist; staff know when to override, they just need
 * the reminder in front of them.
 */

export interface BookingWarningInput {
  moveInDate: Date;
  /** "HH:MM" from the time input; empty = no time check. */
  moveInTime: string;
  /** Injectable clock for tests. */
  now?: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toMinutes(hhmm: string): number | null {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function bookingWarnings(i: BookingWarningInput): string[] {
  const out: string[] = [];
  const now = i.now ?? new Date();
  const dayDiff = Math.round(
    (startOfDay(i.moveInDate).getTime() - startOfDay(now).getTime()) / 86_400_000
  );
  if (dayDiff < MIN_PREP_DAYS) {
    out.push(`เตรียมห้องเร็วสุด ${MIN_PREP_DAYS} วัน — วันที่เลือกอาจไม่ทัน`);
  }

  const isClosedDay = i.moveInDate.getDay() === BUSINESS_HOURS.closedDay;
  const mins = toMinutes(i.moveInTime);
  const inHours =
    mins !== null &&
    BUSINESS_HOURS.blocks.some(([a, b]) => {
      const from = toMinutes(a)!;
      const to = toMinutes(b)!;
      return mins >= from && mins <= to;
    });
  if (isClosedDay || (mins !== null && !inHours)) {
    out.push("นอกเวลาทำการ (จ.–ส. 08:30–12:00, 13:00–17:00)");
  }
  return out;
}

/** เข้าพักปลายเดือน (วันที่ ≥ 25) → ควรเก็บค่าเช่าเดือนถัดไปล่วงหน้า
 *  (P1-3 auto-tick; ผู้ใช้เอาออกเองได้เสมอ — effect ฝั่ง UI เคารพ
 *  touched flag). */
export function shouldAutoChargeNextMonth(moveInDate: Date): boolean {
  return moveInDate.getDate() >= AUTO_CHARGE_NEXT_MONTH_FROM_DAY;
}
