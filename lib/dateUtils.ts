import { parse, startOfWeek, endOfWeek, isWithinInterval, isSameDay, getMonth, getYear } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const TZ = "Asia/Bangkok";

export function getBangkokNow(): Date {
  return toZonedTime(new Date(), TZ);
}

export function parseThaiDate(dateStr: string): Date | null {
  if (!dateStr || !dateStr.trim()) return null;
  const trimmed = dateStr.trim();
  // รองรับ DD/MM/YYYY และ D/M/YYYY
  const parts = trimmed.split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map((p) => parseInt(p, 10));
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  // Range validation — ป้องกัน Date constructor accept "99/99/2026"
  // ที่ overflow ไปวันที่อื่นโดยไม่ throw error
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;
  // สร้างวันที่ใน timezone Bangkok โดยตรง
  const bangkokDateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`;
  const date = fromZonedTime(new Date(bangkokDateStr), TZ);
  return toZonedTime(date, TZ);
}

/**
 * Parse a date string returned from the Google Sheet (`งาน` tab).
 *
 * Apps Script `fmtDate_` returns:
 *   - "yyyy-MM-dd" when the cell is a Date object (e.g. "2026-05-04")
 *   - the raw cell string otherwise (often "dd/MM/yyyy" typed by hand)
 *
 * This helper accepts both — plus DMY with `-` or `.` separators and
 * 2-digit years — and validates day (1-31) / month (1-12) strictly.
 * Returns `null` for any invalid input.
 *
 * Returned Date is a local Date (no timezone shift). Callers that need
 * Bangkok-aware comparisons should prefer `parseThaiDate` for legacy
 * DMY-only data; this helper is for sheet-API responses.
 */
export function parseSheetDate(s: string): Date | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;

  // ISO 8601 (year-first): yyyy-M-d  — what Apps Script emits for Date cells
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (mo < 1 || mo > 12) return null;
    if (d < 1 || d > 31) return null;
    return new Date(y, mo - 1, d);
  }

  // Day-first: d/M/yyyy or d-M-yyyy or d.M.yyyy (also 2-digit year)
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (mo < 1 || mo > 12) return null;
    if (d < 1 || d > 31) return null;
    if (y < 100) y = 2000 + y;
    return new Date(y, mo - 1, d);
  }

  return null;
}

export function isToday(date: Date): boolean {
  const now = getBangkokNow();
  return isSameDay(date, now);
}

export function isThisWeek(date: Date): boolean {
  const now = getBangkokNow();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // จันทร์
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  return isWithinInterval(date, { start: weekStart, end: weekEnd });
}

export function isThisMonth(date: Date): boolean {
  const now = getBangkokNow();
  return getMonth(date) === getMonth(now) && getYear(date) === getYear(now);
}

export function getThisWeekDays(): Date[] {
  const now = getBangkokNow();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const THAI_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function formatThaiDate(date: Date): string {
  const dow = THAI_DAYS[date.getDay()];
  const d = date.getDate();
  const m = THAI_MONTHS[date.getMonth()];
  return `${dow} ${d} ${m}`;
}
