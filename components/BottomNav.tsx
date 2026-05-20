"use client";

import type { Role } from "@/auth";
import { canAccess, canPerform, type Route } from "@/lib/permissions";
import { Icon, type IconName } from "@/lib/icons";

export type BottomNavView =
  | "overview" | "today" | "ready" | "tenants"
  | "qc" | "repair" | "maintenance" | "facilities"
  | "income" | "calendar"
  | "salespipeline" | "engineerkanban";

interface Tab {
  key: BottomNavView | "add";
  label: string;
  icon: IconName;
  /** "primary" makes the tab visually distinct (the add button). */
  variant?: "default" | "primary";
}

interface Props {
  /** Currently active view (matches one of the tab keys). */
  activeView: string;
  /** All roles the user has — used to pick which tabs to show. */
  roles: Role[] | undefined;
  /** Navigate to a view. */
  onNavigate: (view: BottomNavView) => void;
  /** Open the add-task modal. */
  onAddTask: () => void;
}

/**
 * Mobile bottom nav — visible only on small screens. Sidebar stays
 * available via the hamburger in the header for full navigation; this
 * is just quick access to a role's most-used 4 views + an Add Task
 * primary action.
 *
 * Tab selection rule:
 *   - Tabs 1, 2, 3 always: ภาพรวม / วันนี้ / + เพิ่ม
 *   - Tabs 4, 5 depend on the user's "primary" effective role
 *
 * Multi-role users with View-as filter: page.tsx passes the
 * effectiveRoles so flipping View-as also flips the bottom-nav tabs.
 * Final fallback when nothing matches: show calendar + nothing.
 */

function pickRoleTabs(roles: Role[] | undefined): Tab[] {
  const has = (r: Role) => Boolean(roles?.includes(r));
  // Decide primary "mode" — management trumps engineer trumps sales
  // when a user has multiple. View-as in page.tsx will narrow this.
  if (has("management")) {
    return [
      { key: "income",   label: "รายได้",   icon: "income" },
      { key: "calendar", label: "ปฏิทิน",   icon: "calendar" },
    ];
  }
  if (has("engineer")) {
    // First tab = mode landing page (engineerkanban) so the active-state
    // indicator works when the user is on their home view.
    return [
      { key: "engineerkanban", label: "กระดาน",    icon: "maintenance" },
      { key: "repair",         label: "งานซ่อม",   icon: "tasks" },
    ];
  }
  if (has("sales")) {
    // First tab = mode landing (salespipeline) — was missing, so sales
    // users had no active state on the bottom bar when on their home view.
    return [
      { key: "salespipeline", label: "ภาพรวมขาย", icon: "tenants" },
      { key: "ready",         label: "ห้องว่าง",  icon: "grid" },
    ];
  }
  // Unknown / no role — should never normally happen since middleware
  // would have rejected the request, but render a safe minimum.
  return [{ key: "calendar", label: "ปฏิทิน", icon: "calendar" }];
}

export default function BottomNav({ activeView, roles, onNavigate, onAddTask }: Props) {
  const canAdd = canPerform(roles, "task.add");
  const roleTabs = pickRoleTabs(roles)
    // Filter out any tab the user can't access (multi-role View-as edge)
    .filter((t) => t.key === "add" || canAccess(roles, t.key as Route));

  const fixedHead: Tab[] = [
    { key: "overview", label: "ภาพรวม",  icon: "grid" },
    { key: "today",    label: "วันนี้",   icon: "tasks" },
  ];
  const addTab: Tab | null = canAdd
    ? { key: "add", label: "เพิ่ม", icon: "add", variant: "primary" }
    : null;

  const tabs: Tab[] = [
    ...fixedHead,
    ...(addTab ? [addTab] : []),
    ...roleTabs,
  ].slice(0, 5);

  return (
    <nav
      className="ac-bottom-nav"
      role="navigation"
      aria-label="แถบนำทางด้านล่าง"
    >
      {tabs.map((tab) => {
        const isActive = activeView === tab.key;
        const isPrimary = tab.variant === "primary";
        return (
          <button
            key={tab.key}
            type="button"
            className={`ac-bottom-nav-tab ${isActive ? "is-active" : ""} ${isPrimary ? "is-primary" : ""}`}
            onClick={() => {
              if (tab.key === "add") {
                onAddTask();
              } else {
                onNavigate(tab.key as BottomNavView);
              }
            }}
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.label}
          >
            <span className="ac-bottom-nav-icon">
              <Icon name={tab.icon} size={isPrimary ? 22 : 20} strokeWidth={isPrimary ? 2.25 : 1.75} />
            </span>
            <span className="ac-bottom-nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
