import type { SheetRow } from "@/types";

/**
 * Composite identifier used to reference a specific task row when the
 * sheet doesn't have a stable id column. Format: `date|building|room|type`.
 *
 * Why a composite: the existing งาน sheet predates uuid columns, so
 * the dashboard joins by (date, building, room, type) and that tuple
 * is unique-by-construction (no two tasks of the same type happen in
 * the same room on the same day in practice).
 *
 * Used by:
 *   - EngineerKanban (busy/flash state, click handlers)
 *   - Time tracking (links a time log to a task row — Task 35)
 *   - any future cross-feature linking
 */
export function taskKey(t: Pick<SheetRow, "date" | "building" | "room" | "type">): string {
  return `${t.date}|${t.building}|${t.room}|${t.type}`;
}
