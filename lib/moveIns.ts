import type { RoomView, SheetRow } from "@/types";
import { parseThaiDate } from "@/lib/dateUtils";
import { buildingSortIndex } from "@/lib/salesData";

/**
 * Booked-room (รอสัญญา) helpers — shared by the overview "รอเข้าอยู่" list
 * and the bell notification, so both agree on which rooms still have no
 * move-in date.
 *
 * Works on RoomView.todayTasks/upcomingTasks, which useDashboardData
 * already limits to OPEN tasks dated today or later — a cancelled or
 * past ย้ายเข้า doesn't count as an appointment.
 */

/** Nearest open appointment of `type` (today or later) — the date a
 *  notice-given room frees up (ย้ายออก) or a booked room fills (ย้ายเข้า). */
export function nextAppointment(r: RoomView, type: "ย้ายออก" | "ย้ายเข้า"): Date | null {
  let best: Date | null = null;
  const all: SheetRow[] = [...(r.todayTasks || []), ...(r.upcomingTasks || [])];
  for (const t of all) {
    if (t.type !== type) continue;
    const d = parseThaiDate(t.date);
    if (d && (!best || d.getTime() < best.getTime())) best = d;
  }
  return best;
}

export const byBuildingThenRoom = (a: RoomView, b: RoomView) =>
  buildingSortIndex(a.building) - buildingSortIndex(b.building) ||
  a.building.localeCompare(b.building) ||
  a.room.localeCompare(b.room, undefined, { numeric: true });

/** รอสัญญา rooms in the order someone should look at them: soonest
 *  move-in first; rooms booked WITHOUT a move-in appointment last — those
 *  are the ones to chase ("ยังไม่นัดวันเข้า"). */
export function sortPendingByMoveIn(rooms: RoomView[]): RoomView[] {
  const at = (r: RoomView) => nextAppointment(r, "ย้ายเข้า")?.getTime() ?? Number.POSITIVE_INFINITY;
  return [...rooms].sort((a, b) => at(a) - at(b) || byBuildingThenRoom(a, b));
}

/** Booked rooms that have no move-in appointment yet. */
export function unscheduledMoveIns(rooms: RoomView[]): RoomView[] {
  return rooms.filter((r) => r.status === "pending" && !nextAppointment(r, "ย้ายเข้า"));
}
