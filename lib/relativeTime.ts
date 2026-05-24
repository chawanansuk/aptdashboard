/**
 * Format a Thai-friendly relative time label from a "yyyy-MM-dd HH:mm"
 * (Apps Script's createdAt / audit timestamp format). Output examples:
 *   "เพิ่งสร้าง" / "5 นาทีที่แล้ว" / "2 ชม.ที่แล้ว" /
 *   "เมื่อวาน" / "3 วันที่แล้ว" / "2 สัปดาห์ที่แล้ว" /
 *   ">1 เดือน" (older)
 *
 * Returns "" for unparseable input rather than throwing — callers
 * render empty string as a fallback.
 */

/**
 * Robustly turn a sheet timestamp into a Date.
 *
 * Apps Script writes "yyyy-MM-dd HH:mm:ss" via Utilities.formatDate,
 * but Google Sheets sometimes silently coerces that text into a real
 * Date cell. When read back the value becomes a JS Date string like
 * "Mon May 25 2026 10:30:45 GMT+0700 (Indochina Time)". The old code
 * relied on Date.parse which is inconsistent across engines for the
 * canonical "yyyy-MM-dd HH:mm:ss" form (some treat the space-separated
 * variant as invalid), so valid timestamps silently rendered blank.
 *
 * Strategy: match the canonical sheet format explicitly first
 * (treated as local wall-clock), then fall back to Date.parse for the
 * coerced-Date-string case.
 */
export function parseSheetTimestamp(s: string | undefined): Date | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;

  // Canonical "yyyy-MM-dd[ T]HH:mm[:ss]" — what Apps Script emits.
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3], hh = +m[4], mi = +m[5], ss = m[6] ? +m[6] : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59 || ss > 59) return null;
    const date = new Date(y, mo - 1, d, hh, mi, ss);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
    return date;
  }

  // Date-only "yyyy-MM-dd" — treat as midnight local.
  const md = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (md) {
    const y = +md[1], mo = +md[2], d = +md[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
    return date;
  }

  // Legacy fallback: a coerced JS Date string ("Mon May 25 2026 ...").
  const parsed = Date.parse(t);
  if (Number.isFinite(parsed)) return new Date(parsed);

  return null;
}

export function relativeTimeLabel(s: string | undefined, now: Date = new Date()): string {
  const date = parseSheetTimestamp(s);
  if (!date) return "";
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "เพิ่งสร้าง"; // clock skew tolerance — pretend "just now"
  const min = Math.round(diffMs / 60_000);
  if (min < 1)  return "เพิ่งสร้าง";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ชม.ที่แล้ว`;
  const day = Math.round(hr / 24);
  if (day === 1) return "เมื่อวาน";
  if (day < 7)  return `${day} วันที่แล้ว`;
  const wk = Math.round(day / 7);
  if (wk < 4)  return `${wk} สัปดาห์ที่แล้ว`;
  return ">1 เดือน";
}
