/**
 * Task location helper — Task 38.
 *
 * A task targets either a tenant ROOM (most cases) or a building-level
 * COMMON AREA (lift, pool, lobby, etc.). Both share the `building` column
 * but the location identifier lives in the `room` field with a marker
 * prefix `ส่วนกลาง:<type>` for common areas. No new sheet column needed.
 *
 * Why a prefix rather than a dedicated column:
 *   - existing sheet schema stays untouched (existing tasks parse fine)
 *   - parseSheet / API responses need no change
 *   - sales-side views never see ENG-only common-area tasks (filtered)
 *   - reversible — if we want a dedicated column later, this is a 1-line
 *     migration
 */

import type { SheetRow } from "@/types";

/**
 * Marker that the room field actually stores a common-area facility type
 * (e.g. "ส่วนกลาง:ลิฟต์"). The prefix is intentionally readable Thai so
 * sheet inspectors can tell what they're looking at without docs.
 */
export const COMMON_AREA_PREFIX = "ส่วนกลาง:";

/**
 * Catalog of common-area issue types selectable from AddTask form
 * (Task 38 — common-area task target). Updated per real-world use:
 * removed unused (สระว่ายน้ำ / เครื่องปั่นไฟ / ล็อบบี้ / ที่จอดรถ),
 * added issue-oriented entries (ไฟแสงสว่าง, ต้นไม้, ท่อตัน, น้ำรั่ว,
 * น้ำท่วมขัง, หลังคา) to match the kind of "ส่วนกลาง" repair tickets
 * actually filed. "อินเตอร์เน็ต" / "กล้องวงจรปิด" use Thai-readable
 * labels (was WiFi / CCTV).
 *
 * "อื่นๆ" stays last so users with a non-listed issue have an escape
 * hatch — they should add detail in the task note field.
 */
export const COMMON_AREA_TYPES: readonly string[] = [
  "ทางเดิน",
  "ลิฟต์",
  "ไฟแสงสว่าง",
  "ต้นไม้",
  "ท่อตัน",
  "น้ำรั่ว",
  "น้ำท่วมขัง",
  "ปั๊มน้ำ",
  "หลังคา",
  "อินเตอร์เน็ต",
  "กล้องวงจรปิด",
  "อื่นๆ",
] as const;

/** Bare form — MaintLogView's log modal writes this when the user gave
 *  no specific spot. Both forms mean "common area":
 *    "ส่วนกลาง"          (no spot)
 *    "ส่วนกลาง:ลิฟต์"    (with facility/spot) */
export const COMMON_AREA_BARE = "ส่วนกลาง";

/** True iff the task's location is a common area (not a tenant room).
 *  Accepts BOTH encodings (audit r8: the two features each invented one
 *  and couldn't see each other's tasks). */
export function isCommonAreaTask(t: { room: string }): boolean {
  return !!t.room && (t.room === COMMON_AREA_BARE || t.room.startsWith(COMMON_AREA_PREFIX));
}

/** The spot/facility part ("ลิฟต์"), or "" for the bare form / rooms. */
export function commonAreaSpot(room: string): string {
  return room.startsWith(COMMON_AREA_PREFIX) ? room.slice(COMMON_AREA_PREFIX.length) : "";
}

export type LocationKind = "room" | "common";
export interface ParsedLocation {
  kind: LocationKind;
  /** Human-friendly label for display ("ห้อง 101" or "ลิฟต์"). */
  label: string;
  /** Original raw room string from the sheet. */
  raw: string;
}

/**
 * Parse a task's location into a UI-renderable form. For a common-area
 * task the label is the facility type (strips the prefix); for a room
 * task it's the room number prefixed with "ห้อง ".
 */
export function parseTaskLocation(t: { room: string }): ParsedLocation {
  const raw = t.room || "";
  if (isCommonAreaTask({ room: raw })) {
    const spot = commonAreaSpot(raw);
    return {
      kind: "common",
      label: spot || COMMON_AREA_BARE,
      raw,
    };
  }
  return { kind: "room", label: `ห้อง ${raw}`, raw };
}

/**
 * Compose the sheet-encoded value for a common-area selection. Caller
 * uses this when submitting AddTaskModal in "ส่วนกลาง" mode.
 */
export function formatCommonArea(facilityType: string): string {
  return `${COMMON_AREA_PREFIX}${facilityType}`;
}

/**
 * Subset filter for Kanban / list views. "all" returns everything;
 * "room" / "common" narrow.
 */
export type LocationFilter = "all" | "room" | "common";

export function filterTasksByLocation<T extends Pick<SheetRow, "room">>(
  tasks: T[],
  filter: LocationFilter,
): T[] {
  if (filter === "all") return tasks;
  if (filter === "common") return tasks.filter(isCommonAreaTask);
  return tasks.filter((t) => !isCommonAreaTask(t));
}
