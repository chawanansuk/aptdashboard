import { z } from "zod";
import { COMMON_AREA_PREFIX } from "@/lib/taskLocation";

/**
 * Schema กลางสำหรับ "เพิ่มงาน" (AddTaskModal + server validation)
 *
 * - Date: รับเป็น string `yyyy-MM-dd` (HTML <input type="date">) แล้ว
 *   coerce เป็น Date
 * - Type: enum 6 ค่าตาม business rule
 * - Building: enum 5 ตึกตามชีต — ใช้ const literal เพื่อ future-proof
 * - Room: string non-empty (ความถูกต้องของ "ห้องเลขนี้ในตึกนี้" ตรวจ
 *   แบบ async ผ่าน refine เมื่อ caller ส่ง rooms list)
 * - Cost: optional, ต้องเป็น non-negative number
 * - Note: optional, max 500
 *
 * ใช้ผ่าน makeTaskSchema(rooms) เพื่อ inject rooms list สำหรับ
 * cross-field validation ("ห้องนี้มีในตึกนี้ไหม"). server-side สามารถ
 * เรียกตัวเดียวกันด้วย rooms ที่ดึงจาก source of truth
 */

export const TASK_TYPES = [
  "ย้ายเข้า",
  "ย้ายออก",
  "ชมห้อง",
  "ทำสะอาด",
  "ซ่อม",
  "อื่นๆ",
] as const;

export const BUILDINGS = ["Kl", "มั่งมี", "มายทรี48", "มีทรัพย์", "มีทอง"] as const;

export interface RoomRef {
  building: string;
  room: string;
  /** Optional sheet price (raw string from "ราคา" column). Used for
   *  building-aware placeholders in AddTaskModal — not by the schema. */
  price?: string;
}

/**
 * Base schema (no cross-field validation) — useful when caller validates
 * structure separately from room existence. Default `makeTaskSchema()`
 * adds the room-exists refine.
 */
export const baseTaskSchema = z.object({
  date: z.string().min(1, "กรอกวันที่"),
  type: z.enum(TASK_TYPES, { message: "เลือกประเภทงาน" }),
  // Just "non-empty" — NOT z.enum(BUILDINGS). The building dropdown is
  // populated from the live rooms sheet, and the room-exists refine in
  // makeTaskSchema() validates the (building, room) pair against that
  // same sheet. A hardcoded enum here only DUPLICATED that check while
  // drifting from the sheet's spelling: the sheet stores "KL" but
  // BUILDINGS had "Kl", so every sales attempt to add/update a task in
  // KL was rejected with "เลือกตึก" even though KL was selected. The
  // sheet is the single source of truth; trust it.
  building: z.string().trim().min(1, "เลือกตึก"),
  room: z.string().min(1, "กรอกเลขห้อง").trim(),
  // Optional strings — RHF default values supply "" so the input field
  // never actually sees `undefined`. Keeping them strictly `string` here
  // keeps the resolver input/output types in sync (zod v4 + RHF
  // generic constraint).
  customer: z.string().max(120),
  phone: z.string().max(40),
  note: z.string().max(500),
  /** Raw cost string from input (parent parses to number when submitting). */
  cost: z.string(),
});

export type TaskFormValues = z.infer<typeof baseTaskSchema>;

/**
 * Schema ที่มี room-exists validation — pass rooms list (ค่อยๆ ดึงมา
 * จาก dashboard data). Caller decides whether to enforce strict room
 * existence (occupied/ready/etc) — by default we only require that
 * the {building, room} pair exists somewhere in the list.
 */
export function makeTaskSchema(rooms: RoomRef[] = []) {
  if (rooms.length === 0) {
    // No room data yet — fall back to base (don't block submission with
    // "ไม่พบห้องนี้" when the rooms list is still loading)
    return baseTaskSchema;
  }
  const lookup = new Set(
    rooms.map((r) => `${(r.building || "").trim()}|${(r.room || "").trim()}`),
  );
  return baseTaskSchema.refine(
    (v) => {
      // Common-area tasks (Task 38) target a building-level facility, not
      // a specific tenant room — skip the "room exists" check for them.
      if (v.room.startsWith(COMMON_AREA_PREFIX)) return true;
      return lookup.has(`${v.building}|${v.room.trim()}`);
    },
    {
      message: "ไม่พบห้องนี้ในตึกที่เลือก",
      path: ["room"],
    },
  );
}
