/**
 * Thai-friendly "relative-day" labels — single source for the
 * "วันนี้ / พรุ่งนี้ / อีก N วัน / N วันที่แล้ว" family that was
 * copy-pasted across components (RoomsView.relativeDateLabel,
 * RoomModal.relativeDate). They diverged on whether to clamp at ±7
 * days, which made the same date render differently in the grid vs
 * the modal (Q7 from the audit).
 *
 * For the "X ชั่วโมงที่แล้ว" / "X นาที" timestamp variant see
 * `lib/relativeTime.ts` — that one ingests "yyyy-MM-dd HH:mm" Apps
 * Script timestamps and is its own concern.
 */

import { parseThaiDate, getBangkokNow } from "./dateUtils";

export interface RelativeDateOptions {
  /** Inject a clock for tests. Default: real now. */
  now?: Date;
  /** If `|diff| > clampDays`, return the fallback instead of "อีก N วัน".
   *  Default: Infinity (no clamp — show the literal day count). */
  clampDays?: number;
  /** When clamped: `"raw"` returns the input string (RoomModal style),
   *  `"empty"` returns `""`. Default `"raw"`. */
  fallback?: "raw" | "empty";
}

/**
 * Format a Thai "dd/MM/yyyy" date string as a relative-day label.
 *
 *   relativeThaiDate("19/05/2026")                    → "อีก 5 วัน"
 *   relativeThaiDate("19/05/2026", { clampDays: 7 })  → "อีก 5 วัน"
 *   relativeThaiDate("19/06/2027", { clampDays: 7 })  → "19/06/2027" (raw fallback)
 *   relativeThaiDate(d-of-today)                      → "วันนี้"
 *   relativeThaiDate("garbage")                       → "garbage" (raw) / "" (empty)
 */
export function relativeThaiDate(
  input: string,
  opts: RelativeDateOptions = {},
): string {
  // Default clock is Bangkok wall-clock (matches parseThaiDate's frame);
  // a plain new Date() on a UTC host shifts the "วันนี้/พรุ่งนี้" boundary
  // off by one near midnight (#157). Tests still inject `now` explicitly.
  const { now = getBangkokNow(), clampDays = Infinity, fallback = "raw" } = opts;
  const d = parseThaiDate(input);
  if (!d) return fallback === "raw" ? (input || "") : "";

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) return "วันนี้";
  if (diff === 1) return "พรุ่งนี้";
  if (diff === -1) return "เมื่อวาน";
  if (Math.abs(diff) > clampDays) {
    return fallback === "raw" ? input : "";
  }
  return diff > 0 ? `อีก ${diff} วัน` : `${Math.abs(diff)} วันที่แล้ว`;
}
