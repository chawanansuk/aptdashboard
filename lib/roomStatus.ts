import type { RoomStatus } from "@/types";

/**
 * Room status canonicalization — Task 11+31.
 *
 * The Google Sheet "ห้อง" column stores statuses as free-text Thai strings
 * with historical variants ("มีคนอยู่" vs "มีผู้เช่า", "ปรับปรุง" vs "ซ่อม",
 * and outliers like "ER"). Rather than migrate the sheet in-place (high
 * risk, no rollback, gone if someone re-pastes a CSV export), we **
 * canonicalize at the consumption layer** — every raw value maps to one
 * of the 7 enum members in `RoomStatus`.
 *
 * The same map powers:
 *   - useDashboardData (client) — builds RoomView
 *   - (optional) API response shaping if we ever expose canonical status
 *
 * Adding a new alias: add the lowercase-Thai key here + bump test fixture.
 */

export const STATUS_FROM_ROOM: Record<string, RoomStatus> = {
  // occupied — "มีผู้เช่า" canonical; "มีคนอยู่" / "อยู่" legacy variants
  "มีคนอยู่": "occupied",
  "มีผู้เช่า": "occupied",
  "อยู่": "occupied",
  // ready / vacant — "ว่าง" canonical
  "ว่าง": "ready",
  "พร้อมขาย": "ready",
  "พร้อม": "ready",
  // repair — owner explicitly asked to coalesce "ปรับปรุง" + "ซ่อม"
  // (no operational difference at this property; both block the room).
  "ปรับปรุง": "repair",
  "รอเข้าซ่อม": "repair",
  "ซ่อม": "repair",
  "รอซ่อม": "repair",
  // pending (waiting move-in / contract)
  "รอสัญญา": "pending",
  "รอย้ายเข้า": "pending",
  // moveout
  "แจ้งย้ายออก": "moveout",
  "รอย้ายออก": "moveout",
  // qc / cleaning
  "รอตรวจ": "qc",
  "QC": "qc",
  "รอทำสะอาด": "qc",
  // inactive / reserved / ER (data-corruption outlier; mapped defensively
  // so the room still surfaces in the dashboard as "ไม่ได้ใช้งาน" rather
  // than disappearing into the unknown bucket).
  "ไม่ได้ใช้งาน": "inactive",
  "ห้องสำรอง": "inactive",
  "สำรอง": "inactive",
  "ER": "inactive",
};

/**
 * Canonical RoomStatus enum for a raw sheet value. Unknown / blank input
 * → "inactive" (safe default; cell stays visible in admin lists rather
 * than getting silently dropped). Trim happens here so callers don't
 * have to remember.
 */
export function normalizeRoomStatus(raw: string | null | undefined): RoomStatus {
  if (!raw) return "inactive";
  const trimmed = String(raw).trim();
  if (!trimmed) return "inactive";
  return STATUS_FROM_ROOM[trimmed] ?? "inactive";
}

/**
 * `true` iff the raw value is a known alias. Useful for diagnostics:
 * surfacing rows where the sheet has an unrecognised status (caller can
 * log a one-time warning so we know to add a new alias).
 */
export function isKnownRoomStatus(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return STATUS_FROM_ROOM[String(raw).trim()] !== undefined;
}
