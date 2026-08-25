/**
 * Task status taxonomy — central place for the strings we write back to
 * the "งาน" sheet. Single source of truth so Kanban + list views + API
 * all agree on what each status means.
 *
 * The sheet column is free-text (it has always accepted any string), so
 * adding new categories like `กำลังทำ` / `ติดขัด` is additive — no
 * migration needed. Existing rows with empty/blank status fall through
 * to the "pending" bucket.
 */

export const TASK_STATUS = {
  /** No work started yet — the implicit default when status is blank. */
  PENDING: "",
  /** Engineer has started the work. */
  IN_PROGRESS: "กำลังทำ",
  /** Stuck — waiting on parts/customer/permission. */
  BLOCKED: "ติดขัด",
  /** Work finished and verified. */
  DONE: "เสร็จ",
  /** Task cancelled without doing the work. */
  CANCELLED: "ยกเลิก",
  /** Viewing outcome: customer saw the room but isn't interested. A
   *  closed/lost outcome (treated like cancelled), but kept as its own
   *  string so the reason the room freed up is auditable. */
  NOT_INTERESTED: "ไม่สนใจ",
} as const;

export type TaskStatusValue = typeof TASK_STATUS[keyof typeof TASK_STATUS];

export type StatusCategory =
  | "pending"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

/**
 * Map any task.status string into one of 5 logical categories. Defensive
 * against legacy/typo'd values: anything we don't recognise as
 * in-progress/blocked/done/cancelled falls into `pending`.
 */
export function categorizeStatus(s: string | null | undefined): StatusCategory {
  const t = (s || "").trim();
  if (t === TASK_STATUS.DONE || t === "done" || t === "ปิดแล้ว") return "done";
  if (t === TASK_STATUS.CANCELLED || t === "cancelled" || t === TASK_STATUS.NOT_INTERESTED) return "cancelled";
  if (t === TASK_STATUS.IN_PROGRESS) return "in_progress";
  if (t === TASK_STATUS.BLOCKED) return "blocked";
  return "pending";
}

/**
 * ป้ายสถานะสำหรับโชว์ผู้ใช้ — แปลค่า legacy ภาษาอังกฤษในชีท
 * ("pending"/"done"/"cancelled") เป็นไทย ค่าไทยเดิมส่งผ่านตามจริง
 * (UI audit r20: ป้าย "pending" โผล่ในงานล่าสุด/งานวันนี้).
 */
export function taskStatusLabel(s: string | null | undefined): string {
  const t = (s || "").trim();
  if (!t) return "";
  if (/^pending$/i.test(t)) return "รอเริ่ม";
  if (/^done$/i.test(t)) return "เสร็จ";
  if (/^cancelled$/i.test(t)) return "ยกเลิก";
  if (t === "เสร็็จ") return "เสร็จ"; // typo ที่เจอจริงในชีท
  return t;
}

/** True if the task is still actionable (engineer can still work on it). */
export function isOpenStatus(s: string | null | undefined): boolean {
  const c = categorizeStatus(s);
  return c === "pending" || c === "in_progress" || c === "blocked";
}
