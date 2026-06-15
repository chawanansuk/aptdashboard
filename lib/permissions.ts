import type { Role } from "@/auth";

/**
 * Permission layer — single source of truth for what each role can SEE
 * (canAccess) and DO (canPerform). All UI gates + API guards funnel
 * through these two helpers.
 *
 * The legacy single-purpose helpers (canDeleteTask, canEditTenant, etc.)
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
  | "qc" | "repair" | "inactive" | "maintenance" | "facilities" | "engineerkanban" | "parts" | "recurring"
  // shared operational
  | "vehicles"
  | "leads"
  // management-only
  | "income" | "reports";

export const ROUTE_ALLOW: Record<Route, Role[]> = {
  // shared — every authenticated user
  overview:    ["sales", "engineer", "management"],
  today:       ["sales", "engineer", "management"],
  calendar:    ["sales", "engineer", "management"],
  // sales-side
  ready:       ["sales", "management"],
  pending:     ["sales", "management"],
  occupied:    ["sales", "management"],
  moveout:     ["sales", "management"],
  // tenants: contains PII (name + phone). Restricted to management only.
  // Previously included "sales" — tightened in 2026-05 per the privacy
  // requirement: tenant identity fields are admin-only.
  tenants:     ["management"],
  salespipeline: ["sales", "management"],
  // engineer-side
  qc:          ["engineer", "management"],
  repair:      ["engineer", "management"],
  inactive:    ["engineer", "management"],
  maintenance: ["engineer", "management"],
  facilities:  ["engineer", "management"],
  engineerkanban: ["engineer", "management"],
  parts:       ["engineer", "management"],
  recurring:   ["engineer", "management"],
  // vehicles: shared operational info (not PII); all authenticated
  // users have visibility per the product decision.
  vehicles:    ["sales", "engineer", "management"],
  // Lead CRM: sales pipeline data. Sales + management; engineer doesn't
  // need it (different workflow).
  leads:       ["sales", "management"],
  // management-only
  income:      ["management"],
  reports:     ["management"],
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
  | "task.add.clean"   // ทำสะอาด (turnover — sales also schedule after moveout)
  | "task.add.eng"     // ซ่อม
  | "task.edit"
  | "task.delete"
  // rooms / tenants
  | "room.editStatus"
  | "tenant.view"     // read tenant name + phone
  | "tenant.edit"
  // equipment + facility (engineer-side assets)
  | "equipment.add"
  | "equipment.edit"
  | "facility.add"
  | "facility.edit"
  | "part.view"
  | "part.edit"
  | "time.track"
  | "vehicle.edit"
  | "lead.edit"
  // financials
  | "finance.view";

export const ACTION_ALLOW: Record<Action, Role[]> = {
  // tasks — all authenticated users can create/edit generic; deletion is mgmt-only
  "task.add":       ["sales", "engineer", "management"],
  "task.add.sales": ["sales", "management"],
  "task.add.clean": ["sales", "engineer", "management"],
  "task.add.eng":   ["engineer", "management"],
  "task.edit":      ["sales", "engineer", "management"],
  "task.delete":    ["management"],
  // tenants / room status — management-only (privacy: tenant identity
  // is PII and never visible to sales/engineer/etc., not just unwritable)
  // Sales can set a room's booking status (tenant/phone/price → รอสัญญา)
  // via the booking-confirmation flow. tenant.edit (free-form room field
  // editing) + tenant.view (reading existing PII) stay management-only.
  "room.editStatus": ["sales", "management"],
  "tenant.view":     ["management"],
  "tenant.edit":     ["management"],
  // engineer-side assets
  "equipment.add":  ["engineer", "management"],
  "equipment.edit": ["engineer", "management"],
  "facility.add":   ["engineer", "management"],
  "facility.edit":  ["engineer", "management"],
  // inventory — engineer/management can view + edit. Sales doesn't
  // touch parts inventory in current workflow.
  "part.view":      ["engineer", "management"],
  "part.edit":      ["engineer", "management"],
  // time tracking — only roles that physically do the work
  // (sales doesn't log task hours).
  "time.track":     ["engineer", "management"],
  // vehicles: all roles edit (per product decision — see route allow)
  "vehicle.edit":   ["sales", "engineer", "management"],
  // Lead CRM: sales + management
  "lead.edit":      ["sales", "management"],
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

export function canDeleteTask(input: RoleInput): boolean {
  return canPerform(input, "task.delete");
}

export function canEditTenant(input: RoleInput): boolean {
  return canPerform(input, "tenant.edit");
}

/** Read access to tenant PII (name, phone, contract details). */
export function canViewTenant(input: RoleInput): boolean {
  return canPerform(input, "tenant.view");
}

/**
 * Read access to a TASK's customer name + phone. Sales need it to call
 * leads for viewings/move-ins and management oversee; engineers don't
 * contact customers, so an engineer-only user gets it stripped. (A user
 * who is engineer AND sales still sees it — sales wins.)
 */
export function canViewTaskCustomer(input: RoleInput): boolean {
  return has(input, "sales", "management");
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

/** Cleaning ("ทำสะอาด") — a turnover task. Allowed for sales too, since
 *  sales handle move-outs and schedule the post-moveout clean. */
export function canAddCleanTask(input: RoleInput): boolean {
  return canPerform(input, "task.add.clean");
}
