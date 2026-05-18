"use client";

import type { RoomStatus } from "@/types";
import type { Role } from "@/auth";
import { STATUS_LABEL, STATUS_DOT } from "@/lib/constants";
import { canAccess, type Route } from "@/lib/permissions";
import { Icon, type IconName } from "@/lib/icons";

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
 * Sidebar = nav grouped by semantic role of each item.
 *
 * Two icon styles: nav items use Lucide icons (consistent stroke,
 * 16px); room-status items use a colored filled dot (the dot IS the
 * status — its color carries meaning). Money/account/etc all use
 * line-icons for visual consistency.
 */

type DotIcon = { kind: "dot"; color: string };
type LucideIcon = { kind: "icon"; name: IconName };
type SidebarIcon = DotIcon | LucideIcon;

interface NavItem {
  key: SidebarView;
  label: string;
  icon: SidebarIcon;
  badge?: number;
  badgeClass?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function dot(color: string): DotIcon { return { kind: "dot", color }; }
function icon(name: IconName): LucideIcon { return { kind: "icon", name }; }

function buildGroups(
  counts: Props["counts"],
  roles: Role[] | undefined
): NavGroup[] {
  const has = (route: Route) => canAccess(roles, route);

  const todayGroup: NavGroup = {
    label: "วันนี้",
    items: [
      { key: "overview", label: "ภาพรวม",    icon: icon("grid"),  badge: counts.total, badgeClass: "ac-badge-indigo" },
      { key: "today",    label: "งานวันนี้", icon: icon("tasks"), badge: counts.today, badgeClass: "ac-badge-red" },
    ],
  };

  const statusItems: NavItem[] = [];
  if (has("ready"))    statusItems.push({ key: "ready",    label: STATUS_LABEL.ready,    icon: dot(STATUS_DOT.ready),    badge: counts.ready || 0,    badgeClass: "ac-badge-green" });
  if (has("pending"))  statusItems.push({ key: "pending",  label: STATUS_LABEL.pending,  icon: dot(STATUS_DOT.pending),  badge: counts.pending || 0,  badgeClass: "ac-badge-indigo" });
  if (has("occupied")) statusItems.push({ key: "occupied", label: STATUS_LABEL.occupied, icon: dot(STATUS_DOT.occupied), badge: counts.occupied || 0, badgeClass: "ac-badge-slate" });

  const taskItems: NavItem[] = [];
  if (has("moveout"))  taskItems.push({ key: "moveout",  label: STATUS_LABEL.moveout,  icon: dot(STATUS_DOT.moveout),  badge: counts.moveout || 0,  badgeClass: "ac-badge-red" });
  if (has("qc"))       taskItems.push({ key: "qc",       label: STATUS_LABEL.qc,       icon: dot(STATUS_DOT.qc),       badge: counts.qc || 0,       badgeClass: "ac-badge-orange" });
  if (has("repair"))   taskItems.push({ key: "repair",   label: STATUS_LABEL.repair,   icon: dot(STATUS_DOT.repair),   badge: counts.repair || 0,   badgeClass: "ac-badge-yellow" });
  if (has("inactive")) taskItems.push({ key: "inactive", label: STATUS_LABEL.inactive, icon: dot(STATUS_DOT.inactive), badge: counts.inactive || 0, badgeClass: "ac-badge-empty" });

  const assetItems: NavItem[] = [];
  if (has("maintenance")) assetItems.push({ key: "maintenance", label: "บำรุงรักษา",    icon: icon("maintenance") });
  if (has("facilities"))  assetItems.push({ key: "facilities",  label: "สาธารณูปโภค",   icon: icon("facilities") });

  const dataItems: NavItem[] = [];
  if (has("calendar")) dataItems.push({ key: "calendar", label: "ปฏิทิน", icon: icon("calendar") });
  if (has("tenants"))  dataItems.push({ key: "tenants",  label: "ผู้เช่า",  icon: icon("tenants") });
  if (has("income"))   dataItems.push({ key: "income",   label: "รายได้",  icon: icon("income") });

  const groups: NavGroup[] = [todayGroup];
  if (statusItems.length) groups.push({ label: "สถานะห้อง", items: statusItems });
  if (taskItems.length)   groups.push({ label: "งาน",       items: taskItems });
  if (assetItems.length)  groups.push({ label: "ทรัพย์สิน",  items: assetItems });
  if (dataItems.length)   groups.push({ label: "ดูข้อมูล",   items: dataItems });
  return groups;
}

function ItemIcon({ icon: ic }: { icon: SidebarIcon }) {
  if (ic.kind === "dot") {
    return <span className="ac-side-dot" style={{ background: ic.color }} aria-hidden />;
  }
  return <Icon name={ic.name} size={16} />;
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
                <span className="ac-side-icon">
                  <ItemIcon icon={item.icon} />
                </span>
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
