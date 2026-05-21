/**
 * Building-aware placeholders for the AddTask form.
 *
 * Why derive from data instead of a hardcoded table:
 *   - Owner adds/renames buildings → hardcoded table goes stale silently.
 *   - Each building has its own room numbering convention (e.g. ตึกมีทรัพย์
 *     uses "1.1, 1.2"; others use "101, 205"). Using a real room number
 *     from that building as the placeholder is always accurate.
 *   - Median price is a much better hint than a global "เช่น 1500" — sales
 *     gets a price anchor for the building they're working with.
 */

export interface PlaceholderRoom {
  building: string;
  room: string;
  /** Sheet price column — accepts string with non-digits ("฿ 5,500") or empty. */
  price?: string;
}

/** Median (50th percentile) of numeric values; null if empty. */
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Extract leading numeric value from a price string. Returns NaN if none. */
function parsePrice(s: string | undefined | null): number {
  if (!s) return NaN;
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Return a representative room number for the building — the most common
 * room number length wins, then the first such room alphanumerically.
 * Fallback: "101" if the building has no rooms (unknown / empty data).
 */
export function getRoomExample(
  rooms: PlaceholderRoom[],
  building: string,
): string {
  if (!building) return "101";
  const matching = rooms.filter((r) => r.building === building && r.room);
  if (matching.length === 0) return "101";
  // Prefer the shortest, lexically-first room number — it's the most
  // "obvious example" rather than an outlier like "B12-corner".
  const sorted = [...matching].sort(
    (a, b) => a.room.length - b.room.length || a.room.localeCompare(b.room, undefined, { numeric: true }),
  );
  return sorted[0].room;
}

/**
 * Return the median monthly price (THB) for rooms in this building, or
 * null if no priced rooms found. Caller formats with toLocaleString.
 */
export function getMedianPrice(
  rooms: PlaceholderRoom[],
  building: string,
): number | null {
  if (!building) return null;
  const nums = rooms
    .filter((r) => r.building === building)
    .map((r) => parsePrice(r.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  return median(nums);
}

/**
 * Build the placeholder for the room-number input. e.g. "เช่น 1.1" or
 * "เช่น 205". Falls back to a neutral "เช่น 101" when no data.
 */
export function getRoomPlaceholder(
  rooms: PlaceholderRoom[],
  building: string,
): string {
  return `เช่น ${getRoomExample(rooms, building)}`;
}

/**
 * Build the placeholder for the cost/price input. Returns a building-
 * specific median hint if rooms have prices; otherwise a neutral default.
 */
export function getCostPlaceholder(
  rooms: PlaceholderRoom[],
  building: string,
): string {
  const m = getMedianPrice(rooms, building);
  if (m == null) return "เช่น 1,500";
  return `เช่น ${m.toLocaleString("th-TH")}`;
}

/**
 * Short human-readable hint about the room-number convention used by
 * this building. Returned empty string when no signal — caller can
 * hide the hint span entirely.
 */
export function getRoomHint(
  rooms: PlaceholderRoom[],
  building: string,
): string {
  const ex = getRoomExample(rooms, building);
  if (ex === "101" && building && !rooms.some((r) => r.building === building)) {
    // Building selected but unknown to data — say so honestly.
    return "";
  }
  return `รูปแบบเลขห้องของตึกนี้ เช่น ${ex}`;
}
