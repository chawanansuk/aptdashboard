import { startOfWeek, endOfWeek, isWithinInterval, isSameDay, getMonth, getYear } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const TZ = "Asia/Bangkok";

/** วันนี้ตามปฏิทินไทยเป็น "yyyy-MM-dd" — ใช้กับทุกจุดที่ประทับ "วันนี้"
 *  ลงชีท. ห้ามใช้ new Date().toISOString() แทน: นั่นคือเวลา UTC ซึ่งก่อน
 *  07:00 น. ไทยยังเป็น "เมื่อวาน" (audit r16 — ปุ่มทำแล้ววันนี้เคยบันทึก
 *  ย้อนหลังหนึ่งวันทุกเช้า). */
export function bangkokTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export function getBangkokNow(): Date {
  return toZonedTime(new Date(), TZ);
}

export function parseThaiDate(dateStr: string): Date | null {
  if (!dateStr || !dateStr.trim()) return null;
  const trimmed = dateStr.trim();
  // ISO 8601 (yyyy-MM-dd) — what Apps Script emits when a sheet cell
  // contains a Date object rather than a typed string. Treat the
  // string as a Bangkok-local wall-clock date (no UTC shift) so that
  // a row dated "2026-05-25" lands on 25/5 for a viewer in Asia/Bangkok
  // — same semantics as the DMY branch below.
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const mo = parseInt(iso[2], 10);
    const d = parseInt(iso[3], 10);
    if (mo < 1 || mo > 12) return null;
    if (d < 1 || d > 31) return null;
    if (y < 1900 || y > 2200) return null;
    const bangkokDateStr = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00`;
    const date = fromZonedTime(new Date(bangkokDateStr), TZ);
    return toZonedTime(date, TZ);
  }
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

  // Build a Date but reject month-overflow rolls (e.g. Feb 30 → Mar 2)
  // by checking the constructed Date's components round-trip to the
  // requested y/m/d. JavaScript's Date constructor accepts overflow
  // silently — only this round-trip catches it.
  const build = (y: number, mo: number, d: number): Date | null => {
    const date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
      return null;
    }
    return date;
  };

  // ISO 8601 (year-first): yyyy-M-d  — what Apps Script emits for Date cells
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (mo < 1 || mo > 12) return null;
    if (d < 1 || d > 31) return null;
    return build(y, mo, d);
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
    return build(y, mo, d);
  }

  return null;
}

export function isToday(date: Date): boolean {
  const now = getBangkokNow();
  return isSameDay(date, now);
}

/**
 * Is a task's date string "today" (Bangkok)? Format-agnostic — the sheet
 * returns dd/MM/yyyy for text cells but ISO yyyy-MM-dd when the cell was
 * coerced to a real Date (fmtDate_ in Code.gs). Raw string compares like
 * `t.date === todayStr` silently miss whichever format they weren't
 * written for — a bug class that has bitten three separate call sites.
 */
export function isTaskDatedToday(dateStr: string, now: Date = getBangkokNow()): boolean {
  const d = parseThaiDate(dateStr);
  return d ? isSameDay(d, now) : false;
}

/** งานลงวันที่ก่อน "วันนี้" (เทียบเที่ยงคืนตามเวลากรุงเทพ) — นิยามกลาง
 *  ที่ sidebar ⚠ / การ์ดงานวันนี้ / hero ใช้ร่วมกัน (audit r22: เดิม
 *  แต่ละจุดเทียบกับ midnight ของ device ทำให้ตัวเลขไม่ตรงกันได้ถ้า
 *  เครื่องไม่ได้ตั้ง TZ ไทย). */
export function isTaskOverdue(dateStr: string, now: Date = getBangkokNow()): boolean {
  const d = parseThaiDate(dateStr);
  if (!d) return false;
  const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return dMid < nowMid;
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
export const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function formatThaiDate(date: Date): string {
  const dow = THAI_DAYS[date.getDay()];
  const d = date.getDate();
  const m = THAI_MONTHS[date.getMonth()];
  return `${dow} ${d} ${m}`;
}
