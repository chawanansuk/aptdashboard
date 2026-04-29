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
  // สร้างวันที่ใน timezone Bangkok โดยตรง
  const bangkokDateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`;
  const date = fromZonedTime(new Date(bangkokDateStr), TZ);
  return toZonedTime(date, TZ);
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
