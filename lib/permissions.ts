import type { Role } from "@/auth";

/* ===== High-level mode checks ===== */
export function isSales(role?: Role | null): boolean {
  return role === "sales";
}

export function isEngineer(role?: Role | null): boolean {
  return role === "engineer";
}

export function isManagement(role?: Role | null): boolean {
  return role === "management";
}

/* ===== Feature permissions =====
 *
 * STRICT backward compatibility with the old admin/staff model:
 *   - canDeleteTask    : was admin-only  → now management-only
 *   - canEditTenant    : was admin-only  → now management-only (will revisit
 *                                          in PR #2 — sales likely needs this
 *                                          for ทำสัญญา, but preserve old
 *                                          behavior for now)
 *   - canAddTask       : was all         → still all (UI filters per role)
 *   - canEditTask      : was all         → still all
 *   - canRead          : was all         → still all
 *
 * New for the three-role world (declared now, wired in PR #2):
 *   - canViewFinancials: management-only — for the รายได้ / Finance view
 *   - canAddSalesTask  : sales+management — ย้ายเข้า/ออก/ชมห้อง
 *   - canAddEngTask    : engineer+management — ซ่อม/ทำสะอาด
 */

export function canRead(role?: Role | null): boolean {
  return role === "sales" || role === "engineer" || role === "management";
}

export function canAddTask(role?: Role | null): boolean {
  return role === "sales" || role === "engineer" || role === "management";
}

export function canEditTask(role?: Role | null): boolean {
  return role === "sales" || role === "engineer" || role === "management";
}

export function canDeleteTask(role?: Role | null): boolean {
  return role === "management";
}

export function canEditTenant(role?: Role | null): boolean {
  return role === "management";
}

export function canViewFinancials(role?: Role | null): boolean {
  return role === "management";
}

export function canAddSalesTask(role?: Role | null): boolean {
  return role === "sales" || role === "management";
}

export function canAddEngTask(role?: Role | null): boolean {
  return role === "engineer" || role === "management";
}
