import type { SheetRow } from "@/types";
import { isClosedStatus } from "@/lib/constants";
import { parseSheetDate } from "@/lib/dateUtils";

/**
 * r32 — "หลังบ้าน Google ตอบช้าเกินไป" ตอนบันทึก: Vercel หมดเวลารอ แต่ Google
 * มักเขียนเสร็จไปแล้ว. แทนที่จะโยนข้อความคลุมเครือให้คนเดา ฝั่งเว็บดึงรายการงาน
 * ล่าสุดมาเช็คเองว่างานที่เพิ่งกดบันทึก "เข้าแล้วหรือยัง" (pure — เทสได้).
 */

export const WRITE_TIMEOUT_STATUS = 504;

/** r34: ตัวช่วยกลาง — ทุกจุดบันทึกใช้ตัวเดียวกันตัดสินว่า "Google ตอบช้าจนหมดเวลา"
 *  (= อาจเข้าแล้ว ต้องรีเฟรชแล้วดู ไม่ใช่ล้มเหลว) จะได้ไม่ต้องไล่แก้ทีละจุดอีก */
export function isWriteTimeout(res: { status: number }): boolean {
  return res.status === WRITE_TIMEOUT_STATUS;
}

export const MAYBE_SAVED_FALLBACK =
  "หลังบ้าน Google ตอบช้า — รายการอาจบันทึกไปแล้ว รีเฟรชดูก่อน ถ้ายังไม่ขึ้นค่อยกดใหม่";

/** ข้อความสำหรับโชว์ผู้ใช้เมื่อหมดเวลารอ (ใช้ของเซิร์ฟเวอร์ถ้ามี) */
export function maybeSavedMessage(data: { error?: unknown } | null | undefined): string {
  const e = data && typeof data.error === "string" ? data.error.trim() : "";
  return e || MAYBE_SAVED_FALLBACK;
}

export interface PendingTaskWrite {
  date: string;
  type: string;
  building: string;
  room: string;
  customer?: string;
  phone?: string;
  note?: string;
}

function digits(v: string | undefined): string {
  return String(v || "").replace(/\D/g, "");
}
function trim(v: string | undefined): string {
  return String(v || "").trim();
}
/** วันที่จากฟอร์ม (yyyy-MM-dd) กับจากชีท (อาจเป็น dd/MM/yyyy) เทียบกันได้ */
function sameDay(a: string, b: string): boolean {
  const da = parseSheetDate(a);
  const db = parseSheetDate(b);
  if (da && db) return da.getTime() === db.getTime();
  return trim(a) === trim(b);
}

/**
 * หางานที่ตรงกับที่เพิ่งส่ง: วัน/ประเภท/ตึก/ห้องตรง + ยังเปิดอยู่ + ตัวตนตรง
 * (เบอร์เฉพาะตัวเลข ถ้ามีทั้งคู่, ไม่งั้นชื่อลูกค้า) + หมายเหตุตรง — กติกาเดียว
 * กับ dedup ใน Code.gs addTask_ (v3.29) เพื่อไม่ทักผิดว่า "เข้าแล้ว" ทั้งที่
 * เป็นงานของลูกค้าอีกคน.
 */
export function findLandedTask(
  tasks: readonly SheetRow[] | undefined,
  w: PendingTaskWrite,
): SheetRow | null {
  if (!tasks || tasks.length === 0) return null;
  const inPhone = digits(w.phone);
  const inCust = trim(w.customer);
  const inNote = trim(w.note);
  for (const t of tasks) {
    if (trim(t.building) !== trim(w.building)) continue;
    if (trim(t.room) !== trim(w.room)) continue;
    if (trim(t.type) !== trim(w.type)) continue;
    if (!sameDay(t.date, w.date)) continue;
    if (isClosedStatus(t.status)) continue;
    const exPhone = digits(t.phone);
    const exCust = trim(t.customer);
    const sameIdentity =
      inPhone && exPhone ? inPhone === exPhone
      : inCust || exCust ? inCust === exCust
      : true;
    if (!sameIdentity) continue;
    if (trim(t.note) !== inNote) continue;
    return t;
  }
  return null;
}

/** ดึงรายการงานสดจากเซิร์ฟเวอร์เพื่อเช็คหลัง timeout — `?fresh=1` ข้ามแคชทุกชั้น
 *  ของ Vercel (ไม่ใช่แค่เบราว์เซอร์) ไม่งั้นอาจไปเจอแคชอุ่นของเครื่องอื่นแล้วตอบผิด */
export async function fetchFreshTasks(): Promise<SheetRow[]> {
  const res = await fetch("/api/dashboard/tasks?fresh=1", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { tasks?: SheetRow[] };
  return Array.isArray(j.tasks) ? j.tasks : [];
}
