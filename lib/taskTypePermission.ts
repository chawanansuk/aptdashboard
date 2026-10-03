import type { Role } from "@/auth";
import { canPerform } from "@/lib/permissions";
import { TASK_TYPES } from "@/lib/taskConstants";

const SALES_TYPES = new Set(["ย้ายเข้า", "ย้ายออก", "ชมห้อง"]);
const CLEAN_TYPES = new Set(["ทำสะอาด"]);
const ENG_TYPES   = new Set(["ซ่อม"]);

/**
 * Can these roles create a task of `type`? null when allowed, otherwise
 * the Thai message to return with a 403. Shared by /api/sheet/update
 * (addTask, re-typing via updateTask) and /api/recurring (templates
 * create tasks of their type every cycle — an engineer's template must
 * not be a back door to sales-only task types, audit r37 L2).
 */
export function taskTypeDenied(type: string, roles: Role[] | undefined): string | null {
  const label = (roles || []).join("+") || "none";
  if (SALES_TYPES.has(type) && !canPerform(roles, "task.add.sales")) {
    return `role "${label}" ไม่มีสิทธิ์เพิ่มงานประเภท "${type}" (งานฝ่ายเซลส์)`;
  }
  if (CLEAN_TYPES.has(type) && !canPerform(roles, "task.add.clean")) {
    return `role "${label}" ไม่มีสิทธิ์เพิ่มงานประเภท "${type}" (งานทำสะอาด)`;
  }
  if (ENG_TYPES.has(type) && !canPerform(roles, "task.add.eng")) {
    return `role "${label}" ไม่มีสิทธิ์เพิ่มงานประเภท "${type}" (งานฝ่ายช่าง)`;
  }
  return null;
}

export function isTaskType(v: string): boolean {
  return (TASK_TYPES as readonly string[]).includes(v);
}
