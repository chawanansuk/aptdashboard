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
 * Building / room are .trim()'d so the key is whitespace-stable: Apps
 * Script's norm() trims when matching on the backend, so the client
 * has to as well or optimistic reconciliation + bulk-select lookups
 * miss when sheet data has stray padding (e.g. " 101" vs "101").
 *
 * Used by:
 *   - EngineerKanban (busy/flash state, click handlers)
 *   - Time tracking (links a time log to a task row — Task 35)
 *   - lib/useDashboardData (optimistic-update reconciliation)
 *   - any future cross-feature linking
 */
export function taskKey(t: Pick<SheetRow, "date" | "building" | "room" | "type">): string {
  return `${t.date}|${(t.building || "").trim()}|${(t.room || "").trim()}|${t.type}`;
}

/**
 * `${building}|${room}` — the canonical room identifier used by every
 * per-room Map/Set lookup (vehicle counts, equipment badges, sidebar
 * filters, sales pipeline rooms, command palette).
 *
 * Always trims both halves so a stray space in one data source
 * ("Kl |101" vs "Kl|101") doesn't silently miss a Map.get and show 0
 * in a badge. The same idiom was hand-built in 15+ sites before this;
 * several of them forgot the trim and were latent badge-mismatch bugs.
 */
export function roomKey(building: string | undefined | null, room: string | undefined | null): string {
  return `${(building || "").trim()}|${(room || "").trim()}`;
}
