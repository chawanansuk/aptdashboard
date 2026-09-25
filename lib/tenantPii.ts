import type { RoomRow } from "@/types";

/**
 * What a role WITHOUT tenant.view gets to see of a room (audit r36).
 *
 * `tenant` and `phone` are blanked outright — they identify a person and
 * the role has no business with them. `contractEnd` stays because sales
 * needs to know which rooms are expiring without knowing who lives there.
 *
 * The free-text `note` stays too: it is how sales tells the people who
 * PREPARE the room what to do ("ลูกค้าขอเข้าช่วงเย็น เตรียมห้องให้ทันบ่าย"),
 * and those people are exactly the engineers this strips for. What must
 * not travel in it is a phone number, so anything shaped like a Thai
 * number is masked to its prefix. Names have their own field (already
 * blanked); a first name someone typed into the note is the team's call.
 *
 * Server-side enforcement is mandatory: even if the UI hides the section,
 * a direct fetch to /api/dashboard/rooms must never leak PII.
 */

/** Thai phone numbers as people write them: 08x-xxx-xxxx, 081 234 5678,
 *  0812345678, 02-123-4567, +66 81 234 5678. 8–10 digits, optional
 *  separators; not glued to other digits (a price "4,500" is untouched). */
const PHONE = /(?<![\d])(?:\+66[\s-]?|0)\d(?:[\s-]?\d){7,9}(?![\d])/g;

export function maskPhones(text: string): string {
  if (!text) return text;
  return text.replace(PHONE, (m) => {
    const digits = m.replace(/\D/g, "");
    return `${digits.slice(0, 3)}-xxx-xxxx`;
  });
}

export function stripTenantPii(rows: RoomRow[]): RoomRow[] {
  return rows.map((r) => ({
    ...r,
    tenant: "",
    phone: "",
    ...(r.note ? { note: maskPhones(r.note) } : {}),
  }));
}
