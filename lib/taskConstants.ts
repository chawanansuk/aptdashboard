/**
 * Plain task constants — no zod, no schema.
 *
 * Why a separate file: lib/taskSchema.ts depends on zod, and many
 * surfaces (RoomView consumers, RecurringView, TasksList header chip,
 * sheetUpdateSchema enum, types/index re-export) only need TASK_TYPES /
 * BUILDINGS — they don't validate. Routing them through taskSchema
 * pulled zod (~250KB) into the initial bundle via the types/index
 * re-export chain. Keeping the constants here lets only the actual
 * schema callers (AddTaskModal + the write boundary) drag in zod.
 *
 * The schema file re-exports both names for back-compat, so existing
 * `import { TASK_TYPES } from "@/lib/taskSchema"` lines still compile —
 * they just no longer drag the rest of the module with them.
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
