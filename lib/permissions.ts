import type { Role } from "@/auth";

/**
 * Permission layer — single source of truth for what each role can SEE
 * (canAccess) and DO (canPerform). All UI gates + API guards funnel
 * through these two helpers.
 *
 * The legacy single-purpose helpers (canAddTask, canDeleteTask, etc.)
 * are kept for backward compatibility and now delegate to canPerform()
 * so the rules live in one table.
 *
 * Accepts RoleInput = Role | Role[] | null | undefined. Single-role
 * callers (legacy) keep working; array callers pass if ANY role matches.
 */

export type RoleInput = Role | Role[] | null | undefined;

function normalize(input: RoleInput): Role[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return [input];
}

function has(input: RoleInput, ...want: Role[]): boolean {
  const list = normalize(input);
  return want.some((r) => list.includes(r));
}

/* ===== High-level mode checks ===== */
export function isSales(input: RoleInput): boolean {
  return has(input, "sales");
}

export function isEngineer(input: RoleInput): boolean {
  return has(input, "engineer");
}

export function isManagement(input: RoleInput): boolean {
  return has(input, "management");
}

/* ====================================================================
 * Route access — canAccess(roles, route)
 *
 * Every sidebar / page view is enumerated here. The Route union must
 * stay in sync with `SidebarView` in AppSidebar.tsx and the
 * `activeView` union in app/page.tsx.
 * ==================================================================== */

export type Route =
  // shared
  | "overview" | "today" | "calendar"
  // sales-side rooms
  | "ready" | "pending" | "occupied" | "moveout" | "tenants" | "salespipeline"
  // engineer-side jobs + assets
  | "qc" | "repair" | "inactive" | "maintenance" | "facilities" | "engineerkanban"
  // management-only
  | "income";

const ROUTE_ALLOW: Record<Route, Role[]> = {
  // shared — every authenticated user
  overview:    ["sales", "engineer", "management"],
  today:       ["sales", "engineer", "management"],
  calendar:    ["sales", "engineer", "management"],
  // sales-side
  ready:       ["sales", "management"],
  pending:     ["sales", "management"],
  occupied:    ["sales", "management"],
  moveout:     ["sales", "management"],
  tenants:     ["sales", "management"],
  salespipeline: ["sales", "management"],
  // engineer-side
  qc:          ["engineer", "management"],
  repair:      ["engineer", "management"],
  inactive:    ["engineer", "management"],
  maintenance: ["engineer", "management"],
  facilities:  ["engineer", "management"],
  engineerkanban: ["engineer", "management"],
  // management-only
  income:      ["management"],
};

export function canAccess(input: RoleInput, route: Route): boolean {
  const allowed = ROUTE_ALLOW[route];
  if (!allowed) return false;
  return has(input, ...allowed);
}

/** Default landing route for a given role set. */
export function getDefaultRoute(input: RoleInput): Route {
  // Everyone gets overview as default — works for every role we have today.
  // If overview is ever restricted, fall through to today.
  if (canAccess(input, "overview")) return "overview";
  if (canAccess(input, "today")) return "today";
  return "calendar";
}

/* ====================================================================
 * Action permissions — canPerform(roles, action)
 *
 * "action" describes a write/destructive operation. UI buttons + API
 * routes both call this. The dotted naming groups related actions:
 *   task.*         — งาน (tasks sheet)
 *   room.*         — ห้อง (rooms sheet)
 *   equipment.*    — อุปกรณ์ในห้อง
 *   facility.*     — สาธารณูปโภคของอาคาร
 *   tenant.*       — ข้อมูลผู้เช่า (ในชีต ห้อง)
 *   finance.*      — รายได้ / financial reports
 * ==================================================================== */

export type Action =
  // tasks
  | "task.add"
  | "task.add.sales"   // ย้ายเข้า/ออก/ชมห้อง
  | "task.add.eng"     // ทำสะอาด/ซ่อม
  | "task.edit"
  | "task.delete"
  // rooms / tenants
  | "room.editStatus"
  | "tenant.edit"
  // equipment + facility (engineer-side assets)
  | "equipment.add"
  | "equipment.edit"
  | "facility.add"
  | "facility.edit"
  // financials
  | "finance.view";

const ACTION_ALLOW: Record<Action, Role[]> = {
  // tasks — all authenticated users can create/edit generic; deletion is mgmt-only
  "task.add":       ["sales", "engineer", "management"],
  "task.add.sales": ["sales", "management"],
  "task.add.eng":   ["engineer", "management"],
  "task.edit":      ["sales", "engineer", "management"],
  "task.delete":    ["management"],
  // tenants / room status — management-only (sales likely needs this later
  // for contract flow, but preserve old admin-only behavior for now)
  "room.editStatus": ["management"],
  "tenant.edit":     ["management"],
  // engineer-side assets
  "equipment.add":  ["engineer", "management"],
  "equipment.edit": ["engineer", "management"],
  "facility.add":   ["engineer", "management"],
  "facility.edit":  ["engineer", "management"],
  // financials
  "finance.view":   ["management"],
};

export function canPerform(input: RoleInput, action: Action): boolean {
  const allowed = ACTION_ALLOW[action];
  if (!allowed) return false;
  return has(input, ...allowed);
}

/* ====================================================================
 * Legacy helpers — delegate to canPerform. Kept so existing call sites
 * keep working without churn. Prefer canPerform() in new code.
 * ==================================================================== */

export function canRead(input: RoleInput): boolean {
  return has(input, "sales", "engineer", "management");
}

export function canAddTask(input: RoleInput): boolean {
  return canPerform(input, "task.add");
}

export function canEditTask(input: RoleInput): boolean {
  return canPerform(input, "task.edit");
}

export function canDeleteTask(input: RoleInput): boolean {
  return canPerform(input, "task.delete");
}

export function canEditTenant(input: RoleInput): boolean {
  return canPerform(input, "tenant.edit");
}

export function canViewFinancials(input: RoleInput): boolean {
  return canPerform(input, "finance.view");
}

export function canAddSalesTask(input: RoleInput): boolean {
  return canPerform(input, "task.add.sales");
}

export function canAddEngTask(input: RoleInput): boolean {
  return canPerform(input, "task.add.eng");
}
