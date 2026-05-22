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
 * Catalog of facility types selectable from the AddTask form. Kept in
 * sync with the existing Facility entity types (lib/constants /
 * types/index.ts) plus a few site-wide areas (ล็อบบี้, ทางเดิน) that
 * aren't tracked as discrete Facilities but still get reported on.
 */
export const COMMON_AREA_TYPES: readonly string[] = [
  "ลิฟต์",
  "สระว่ายน้ำ",
  "ปั๊มน้ำ",
  "WiFi",
  "CCTV",
  "เครื่องปั่นไฟ",
  "ล็อบบี้",
  "ทางเดิน",
  "ที่จอดรถ",
  "อื่นๆ",
] as const;

/** True iff the task's location is a common area (not a tenant room). */
export function isCommonAreaTask(t: { room: string }): boolean {
  return !!t.room && t.room.startsWith(COMMON_AREA_PREFIX);
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
    return {
      kind: "common",
      label: raw.slice(COMMON_AREA_PREFIX.length),
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
