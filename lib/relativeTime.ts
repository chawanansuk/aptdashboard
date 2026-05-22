/**
 * Format a Thai-friendly relative time label from a "yyyy-MM-dd HH:mm"
 * (Apps Script's createdAt format). Output examples:
 *   "เพิ่งสร้าง" / "5 นาทีที่แล้ว" / "2 ชม.ที่แล้ว" /
 *   "เมื่อวาน" / "3 วันที่แล้ว" / "2 สัปดาห์ที่แล้ว" /
 *   ">1 เดือน" (older)
 *
 * Returns "" for unparseable input rather than throwing — callers
 * render empty string as "—".
 */

export function relativeTimeLabel(s: string | undefined, now: Date = new Date()): string {
  if (!s) return "";
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffMs = now.getTime() - t;
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
