import type { Role } from "@/auth";

/**
 * Permission helpers — accept either a single Role (legacy) or Role[]
 * (multi-role). All checks use `.includes()` semantics, so a user with
 * roles [sales, engineer] passes BOTH canAddSalesTask and canAddEngTask.
 *
 * Pass `session.user.roles` (preferred) or `session.user.role` (legacy).
 * Either works thanks to normalize().
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

/* ===== Feature permissions =====
 *
 * STRICT backward compatibility with the old admin/staff model:
 *   - canDeleteTask    : was admin-only  → now management-only
 *   - canEditTenant    : was admin-only  → now management-only
 *   - canAddTask       : was all         → still all (UI filters per role)
 *   - canEditTask      : was all         → still all
 *   - canRead          : was all         → still all
 *
 * Multi-role (v3.10): a user with roles ["sales","engineer"] gets the
 * union — they can add both sales-side and engineer-side tasks.
 */

export function canRead(input: RoleInput): boolean {
  return has(input, "sales", "engineer", "management");
}

export function canAddTask(input: RoleInput): boolean {
  return has(input, "sales", "engineer", "management");
}

export function canEditTask(input: RoleInput): boolean {
  return has(input, "sales", "engineer", "management");
}

export function canDeleteTask(input: RoleInput): boolean {
  return has(input, "management");
}

export function canEditTenant(input: RoleInput): boolean {
  return has(input, "management");
}

export function canViewFinancials(input: RoleInput): boolean {
  return has(input, "management");
}

export function canAddSalesTask(input: RoleInput): boolean {
  return has(input, "sales", "management");
}

export function canAddEngTask(input: RoleInput): boolean {
  return has(input, "engineer", "management");
}
