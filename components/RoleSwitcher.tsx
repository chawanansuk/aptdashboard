"use client";

import type { Role } from "@/auth";
import { useEffectiveRoles, VIEW_AS_ALL, type ViewAsValue } from "@/lib/useEffectiveRoles";

const ROLE_LABEL: Record<Role | typeof VIEW_AS_ALL, string> = {
  all: "ทุก role",
  sales: "Sales",
  engineer: "Engineer",
  management: "Management",
};

/**
 * Multi-role users can switch which subset of their roles drives the
 * UI. Hidden for single-role users (nothing to switch to).
 */
export default function RoleSwitcher() {
  const { actualRoles, viewAs, setViewAs, isMultiRole } = useEffectiveRoles();
  if (!isMultiRole) return null;

  const options: ViewAsValue[] = [VIEW_AS_ALL, ...actualRoles];

  return (
    <label className="ac-role-switcher" title="กรองเมนูตาม role">
      <span className="ac-role-switcher-label">View as</span>
      <select
        className="ac-role-switcher-select"
        value={viewAs}
        onChange={(e) => setViewAs(e.target.value as ViewAsValue)}
      >
        {options.map((v) => (
          <option key={v} value={v}>{ROLE_LABEL[v]}</option>
        ))}
      </select>
    </label>
  );
}
