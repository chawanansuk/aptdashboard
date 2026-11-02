import type { SheetRow } from "@/types";
import type { RoleInput } from "@/lib/permissions";
import { canViewFinancials, canViewTaskCustomer } from "@/lib/permissions";

/**
 * What a role may see of a task row — one place for every API that
 * returns tasks (/api/dashboard, /api/dashboard/tasks, /api/room-tasks).
 *
 *  - customer name + phone: only roles that may see task customers
 *  - cost (ค่าใช้จ่าย): only roles with finance.view (audit r38 — the three
 *    routes stripped the customer but sent repair costs to everyone; the
 *    screens hid them, a direct API call didn't).
 */
export function projectTasksForRoles(rows: SheetRow[], roles: RoleInput): SheetRow[] {
  const customer = canViewTaskCustomer(roles);
  const money = canViewFinancials(roles);
  if (customer && money) return rows;
  return rows.map((t) => {
    const out: SheetRow = { ...t };
    if (!customer) { out.customer = ""; out.phone = ""; }
    if (!money) delete out.cost;
    return out;
  });
}
