"use client";

import type { RoomStatus } from "@/types";
import type { Role } from "@/auth";
import { STATUS_LABEL, STATUS_DOT } from "@/lib/constants";
import { canAccess, type Route } from "@/lib/permissions";

export type SidebarView = "overview" | "today" | RoomStatus | "income" | "tenants" | "calendar" | "maintenance" | "facilities";

interface Props {
  isOpen: boolean;
  activeView: SidebarView;
  onChangeView: (v: SidebarView) => void;
  counts: { total: number; today: number } & Partial<Record<RoomStatus, number>>;
  onBackdropClick: () => void;
  /** ผู้ใช้ปัจจุบัน — ถ้า undefined (loading) ให้แสดง safe default: overview + today เท่านั้น */
  roles?: Role[];
}

/**
 * Sidebar = nav grouped by semantic role of each item:
 *   วันนี้       — landing pages (everyone)
 *   สถานะห้อง    — room status filters (sales-side)
 *   งาน         — task queues (sales + engineer per item)
 *   ทรัพย์สิน    — equipment + facility maintenance (engineer-side)
 *   ดูข้อมูล     — read-only views (income/tenants/calendar)
 *
 * Group + item visibility derived from canAccess() — single source of
 * truth in lib/permissions.ts. View-as filter (effectiveRoles) flows
 * in through `roles` prop.
 */

interface NavItem {
  key: SidebarView;
  label: string;
  /** plain icon char OR colored dot (for status items) */
  icon: string;
  /** if set, paint icon with this color (used by status dots) */
  iconColor?: string;
  badge?: number;
  badgeClass?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function buildGroups(
  counts: Props["counts"],
  roles: Role[] | undefined
): NavGroup[] {
  const has = (route: Route) => canAccess(roles, route);

  const todayGroup: NavGroup = {
    label: "วันนี้",
    items: [
      { key: "overview", label: "ภาพรวม", icon: "▦", badge: counts.total, badgeClass: "ac-badge-indigo" },
      { key: "today",    label: "งานวันนี้", icon: "●", badge: counts.today, badgeClass: "ac-badge-red" },
    ],
  };

  const statusItems: NavItem[] = [];
  if (has("ready"))    statusItems.push({ key: "ready",    label: STATUS_LABEL.ready,    icon: "●", iconColor: STATUS_DOT.ready,    badge: counts.ready || 0,    badgeClass: "ac-badge-green" });
  if (has("pending"))  statusItems.push({ key: "pending",  label: STATUS_LABEL.pending,  icon: "●", iconColor: STATUS_DOT.pending,  badge: counts.pending || 0,  badgeClass: "ac-badge-indigo" });
  if (has("occupied")) statusItems.push({ key: "occupied", label: STATUS_LABEL.occupied, icon: "●", iconColor: STATUS_DOT.occupied, badge: counts.occupied || 0, badgeClass: "ac-badge-slate" });

  const taskItems: NavItem[] = [];
  if (has("moveout"))  taskItems.push({ key: "moveout",  label: STATUS_LABEL.moveout,  icon: "●", iconColor: STATUS_DOT.moveout,  badge: counts.moveout || 0,  badgeClass: "ac-badge-red" });
  if (has("qc"))       taskItems.push({ key: "qc",       label: STATUS_LABEL.qc,       icon: "●", iconColor: STATUS_DOT.qc,       badge: counts.qc || 0,       badgeClass: "ac-badge-orange" });
  if (has("repair"))   taskItems.push({ key: "repair",   label: STATUS_LABEL.repair,   icon: "●", iconColor: STATUS_DOT.repair,   badge: counts.repair || 0,   badgeClass: "ac-badge-yellow" });
  if (has("inactive")) taskItems.push({ key: "inactive", label: STATUS_LABEL.inactive, icon: "●", iconColor: STATUS_DOT.inactive, badge: counts.inactive || 0, badgeClass: "ac-badge-empty" });

  const assetItems: NavItem[] = [];
  if (has("maintenance")) assetItems.push({ key: "maintenance", label: "บำรุงรักษา",    icon: "🔧" });
  if (has("facilities"))  assetItems.push({ key: "facilities",  label: "สาธารณูปโภค",   icon: "🏢" });

  const dataItems: NavItem[] = [];
  if (has("calendar")) dataItems.push({ key: "calendar", label: "ปฏิทิน",  icon: "▦" });
  if (has("tenants"))  dataItems.push({ key: "tenants",  label: "ผู้เช่า",  icon: "⚉" });
  if (has("income"))   dataItems.push({ key: "income",   label: "รายได้",  icon: "฿" });

  const groups: NavGroup[] = [todayGroup];
  if (statusItems.length) groups.push({ label: "สถานะห้อง", items: statusItems });
  if (taskItems.length)   groups.push({ label: "งาน",       items: taskItems });
  if (assetItems.length)  groups.push({ label: "ทรัพย์สิน",  items: assetItems });
  if (dataItems.length)   groups.push({ label: "ดูข้อมูล",   items: dataItems });
  return groups;
}

export default function AppSidebar({
  isOpen, activeView, onChangeView, counts, onBackdropClick, roles,
}: Props) {
  const groups = buildGroups(counts, roles);

  return (
    <>
      <aside className={`ac-side ${isOpen ? "is-open" : ""}`}>
        {groups.map((group) => (
          <div key={group.label} className="ac-side-group">
            <div className="ac-side-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`ac-side-item ${activeView === item.key ? "is-active" : ""}`}
                onClick={() => onChangeView(item.key)}
              >
                <span
                  className="ac-side-icon"
                  style={item.iconColor ? { color: item.iconColor } : undefined}
                >{item.icon}</span>
                <span className="ac-side-text">{item.label}</span>
                {typeof item.badge === "number" && (
                  <span className={`ac-badge ${item.badgeClass || ""}`}>{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </aside>
      {isOpen && <div className="ac-side-backdrop" onClick={onBackdropClick} />}
    </>
  );
}
