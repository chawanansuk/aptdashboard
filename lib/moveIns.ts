import type { RoomView, SheetRow } from "@/types";
import { parseThaiDate } from "@/lib/dateUtils";
import { buildingSortIndex } from "@/lib/salesData";
import { isClosedStatus } from "@/lib/constants";
import { normalizeRoomStatus } from "@/lib/roomStatus";

/**
 * Booked-room (รอสัญญา) helpers — shared by the overview "รอเข้าอยู่" list
 * and the bell notification, so both agree on which rooms still have no
 * move-in date.
 *
 * An appointment is an OPEN task of that type — today, later, or
 * overdue. An overdue ย้ายเข้า nobody closed is still the appointment:
 * counting it as "no date" (audit r36) flagged the room and offered a
 * second ย้ายเข้า on top of the first.
 */

/** Nearest open appointment of `type` — the date a notice-given room
 *  frees up (ย้ายออก) or a booked room fills (ย้ายเข้า). */
export function nextAppointment(r: RoomView, type: "ย้ายออก" | "ย้ายเข้า"): Date | null {
  let best: Date | null = null;
  const all: SheetRow[] = [
    ...(r.upcomingTasks || []), // open, today or later (includes todayTasks)
    ...(r.pastTasks || []).filter((t) => !isClosedStatus(t.status)), // open, overdue
  ];
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

/**
 * A room someone actually booked: the sheet says รอสัญญา, or it already
 * has a ย้ายเข้า. The app also shows a ว่าง room with only a ชมห้อง as
 * "pending" — nobody booked that one, so it must not be listed as
 * "จองแล้ว" or chased for a move-in date (audit r36).
 */
export function isBooked(r: RoomView): boolean {
  if (r.status !== "pending") return false;
  return normalizeRoomStatus(r.rawStatus) === "pending" || nextAppointment(r, "ย้ายเข้า") !== null;
}

/** Booked rooms in the order someone should look at them: rooms with NO
 *  move-in appointment first — those are the ones to chase ("ยังไม่นัด
 *  วันเข้า"), and the bell sends people here for them, so they must not
 *  fall below the card's row limit — then soonest move-in first. */
export function sortPendingByMoveIn(rooms: RoomView[]): RoomView[] {
  const at = (r: RoomView) => nextAppointment(r, "ย้ายเข้า")?.getTime() ?? Number.NEGATIVE_INFINITY;
  return [...rooms].sort((a, b) => at(a) - at(b) || byBuildingThenRoom(a, b));
}

/** Booked rooms that have no move-in appointment yet. */
export function unscheduledMoveIns(rooms: RoomView[]): RoomView[] {
  return rooms.filter((r) => isBooked(r) && !nextAppointment(r, "ย้ายเข้า"));
}
