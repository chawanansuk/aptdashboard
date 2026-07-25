"use client";

import { memo } from "react";
import type { RoomStatus, RoomView } from "@/types";
import type { Role } from "@/auth";
import { STATUS_LABEL, STATUS_DOT } from "@/lib/constants";
import { abbreviateBuilding } from "@/lib/buildingAbbrev";
import { canAccess, type Route } from "@/lib/permissions";
import { Icon, type IconName } from "@/lib/icons";

export type SidebarView = "overview" | "today" | RoomStatus | "income" | "tenants" | "calendar" | "maintenance" | "facilities" | "salespipeline" | "engineerkanban" | "reports" | "parts" | "vehicles" | "pets" | "leads" | "recurring" | "maintlog";

interface Props {
  isOpen: boolean;
  activeView: SidebarView;
  onChangeView: (v: SidebarView) => void;
  counts: { total: number; today: number; overdue?: number; engTurnover?: number } & Partial<Record<RoomStatus, number>>;
  /** Optional asset alert counts — render badges on "อะไหล่" + "บำรุงรักษา"
   *  nav items when value > 0. */
  assetAlerts?: { lowStockParts: number; overdueEquipment: number };
  onBackdropClick: () => void;
  /** ผู้ใช้ปัจจุบัน — ถ้า undefined (loading) ให้แสดง safe default: overview + today เท่านั้น */
  roles?: Role[];
  /** Preferred group order (by label). Groups not listed stay in original order at the end. */
  groupOrder?: string[];
  /** Desktop rail mode (#4). When true the sidebar shrinks to icon-only
   *  width (~64px) and group labels / item text collapse out. Has no
   *  effect on mobile/tablet (≤1280) where the sidebar is an overlay. */
  isCollapsed?: boolean;
  /** Called when the user toggles collapse via the in-sidebar button.
   *  Page-level state owner persists the value. Omit to hide the button. */
  onToggleCollapse?: () => void;
  /** Pinned + recently-opened rooms (#17). Rendered as quick-jump
   *  sections under the nav; clicking opens that room's detail modal. */
  pinnedRooms?: RoomView[];
  recentRooms?: RoomView[];
  onOpenRoom?: (r: RoomView) => void;
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
  /** Secondary badge — useful when an item has 2 distinct counts
   *  (e.g. "งานวันนี้" wants both today-count + overdue-count). */
  secondaryBadge?: number;
  secondaryBadgeClass?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function dot(color: string): DotIcon { return { kind: "dot", color }; }
function icon(name: IconName): LucideIcon { return { kind: "icon", name }; }

function buildGroups(
  counts: Props["counts"],
  roles: Role[] | undefined,
  assetAlerts?: Props["assetAlerts"]
): NavGroup[] {
  const has = (route: Route) => canAccess(roles, route);

  const todayItems: NavItem[] = [
    { key: "overview", label: "ภาพรวม",    icon: icon("grid"),  badge: counts.total, badgeClass: "ac-badge-indigo" },
    { key: "today",    label: "งานวันนี้", icon: icon("tasks"), badge: counts.today, badgeClass: "ac-badge-red", secondaryBadge: counts.overdue || 0, secondaryBadgeClass: "ac-badge-overdue" },
  ];
  if (has("salespipeline")) {
    todayItems.push({ key: "salespipeline", label: "ภาพรวมขาย", icon: icon("tenants") });
  }
  if (has("leads")) {
    todayItems.push({ key: "leads", label: "ผู้สนใจเช่า", icon: icon("tenants") });
  }
  if (has("engineerkanban")) {
    todayItems.push({
      key: "engineerkanban",
      label: "กระดานงานช่าง",
      icon: icon("maintenance"),
      // Surface incoming turnover work so engineers see sales handoffs
      // without polling the board. Hidden when 0 to keep the rail quiet.
      ...((counts.engTurnover ?? 0) > 0 && {
        badge: counts.engTurnover,
        badgeClass: "ac-badge-orange",
      }),
    });
  }
  if (has("maintlog")) {
    todayItems.push({ key: "maintlog", label: "บันทึกซ่อมบำรุง", icon: icon("history") });
  }
  const todayGroup: NavGroup = { label: "วันนี้", items: todayItems };

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
  if (has("maintenance")) {
    // Surface overdue equipment count — proactive engineer cue.
    // Omit badge entirely when 0 so the asset section stays calm in
    // a healthy state (vs. showing "0" alongside real alerts).
    const overdue = assetAlerts?.overdueEquipment ?? 0;
    assetItems.push({
      key: "maintenance",
      label: "บำรุงรักษา",
      icon: icon("maintenance"),
      ...(overdue > 0 && { badge: overdue, badgeClass: "ac-badge-red" }),
    });
  }
  if (has("facilities"))  assetItems.push({ key: "facilities",  label: "สาธารณูปโภค",   icon: icon("facilities") });
  if (has("parts")) {
    const low = assetAlerts?.lowStockParts ?? 0;
    assetItems.push({
      key: "parts",
      label: "อะไหล่",
      icon: icon("inventory"),
      ...(low > 0 && { badge: low, badgeClass: "ac-badge-orange" }),
    });
  }
  if (has("vehicles"))    assetItems.push({ key: "vehicles",    label: "ยานพาหนะ",      icon: icon("vehicle") });
  if (has("pets"))        assetItems.push({ key: "pets",        label: "สัตว์เลี้ยง",     icon: icon("pet") });
  if (has("recurring"))   assetItems.push({ key: "recurring",   label: "งานประจำ",      icon: icon("calendar") });

  const dataItems: NavItem[] = [];
  if (has("calendar")) dataItems.push({ key: "calendar", label: "ปฏิทิน", icon: icon("calendar") });
  if (has("tenants"))  dataItems.push({ key: "tenants",  label: "ผู้เช่า",  icon: icon("tenants") });
  if (has("income"))   dataItems.push({ key: "income",   label: "รายได้",  icon: icon("income") });
  if (has("reports"))  dataItems.push({ key: "reports",  label: "รายงาน",   icon: icon("summary") });

  const groups: NavGroup[] = [todayGroup];
  // Merge status + task items into ONE "สถานะห้อง" group — both are
  // room-status filters from the user's POV (ready/pending/occupied
  // alongside moveout/qc/repair/inactive). Keeping them as two groups
  // collided in reorderGroups Map (same label → second overwrites
  // first, dropping ready/pending/occupied from sales sidebar — bug
  // reported via screenshot 2026-05-23).
  const roomStatusItems = [...statusItems, ...taskItems];
  if (roomStatusItems.length) groups.push({ label: "สถานะห้อง", items: roomStatusItems });
  if (assetItems.length)  groups.push({ label: "ทรัพย์สิน",  items: assetItems });
  if (dataItems.length)   groups.push({ label: "ดูข้อมูล",   items: dataItems });
  return groups;
}

/**
 * Reorder sidebar groups by mode preference. Groups whose labels appear in
 * `order` move to the front in the given order; unknown groups keep their
 * original relative order at the end. Stable + non-destructive.
 */
function reorderGroups(groups: NavGroup[], order: string[] | undefined): NavGroup[] {
  if (!order || order.length === 0) return groups;
  const byLabel = new Map(groups.map((g) => [g.label, g] as const));
  const head: NavGroup[] = [];
  for (const label of order) {
    const g = byLabel.get(label);
    if (g) { head.push(g); byLabel.delete(label); }
  }
  // Remaining groups keep their original relative order
  const tail = groups.filter((g) => byLabel.has(g.label));
  return [...head, ...tail];
}

function ItemIcon({ icon: ic }: { icon: SidebarIcon }) {
  if (ic.kind === "dot") {
    return <span className="ac-side-dot" style={{ background: ic.color }} aria-hidden />;
  }
  return <Icon name={ic.name} size={16} />;
}

/**
 * Map a sidebar view key to the API endpoint(s) that the view will fetch
 * once mounted. Hovering the nav item prefetches these in the background
 * — browser cache (Cache-Control: private) absorbs the response so the
 * eventual click renders from cache instead of network.
 *
 * Returns `null` for views that don't fetch on mount (overview/today
 * already use the shared dashboard data hook; no extra fetch needed).
 */
function prefetchUrlsFor(key: SidebarView): string[] | null {
  switch (key) {
    case "maintenance":     return ["/api/maintenance-plan"];
    case "facilities":      return ["/api/facilities"];
    case "parts":           return ["/api/parts"];
    case "vehicles":        return ["/api/vehicles"];
    case "pets":            return ["/api/room-photos?scope=pets"];
    case "recurring":       return ["/api/recurring"];
    case "leads":           return ["/api/leads"];
    // Sales/Engineer/Tenants views consume the already-loaded dashboard
    // data — no extra prefetch necessary.
    default:                return null;
  }
}

function prefetch(url: string) {
  // GET with `cache: "force-cache"` lets browser hit disk cache fast if
  // we already fetched within Cache-Control max-age window; otherwise
  // the request goes to network and primes both Vercel SWR + browser cache.
  // Errors are silent — this is best-effort warmup.
  try {
    fetch(url, { cache: "force-cache", credentials: "include" }).catch(() => {});
  } catch {
    // ignore — sandbox / SSR
  }
}

function AppSidebar({
  isOpen, activeView, onChangeView, counts, onBackdropClick, roles, groupOrder, assetAlerts,
  isCollapsed, onToggleCollapse,
  pinnedRooms, recentRooms, onOpenRoom,
}: Props) {
  const groups = reorderGroups(buildGroups(counts, roles, assetAlerts), groupOrder);
  // Mobile overlay forces full layout regardless of collapse — the rail
  // would be useless when the panel is already a 220px overlay.
  const railMode = !!isCollapsed && !isOpen;

  return (
    <>
      <aside
        className={`ac-side ${isOpen ? "is-open" : ""} ${railMode ? "is-collapsed" : ""}`}
        aria-label="เมนูข้าง"
        data-collapsed={railMode ? "1" : "0"}
      >
        {onToggleCollapse && (
          <button
            type="button"
            className="ac-side-collapse-btn"
            onClick={onToggleCollapse}
            aria-label={railMode ? "ขยายเมนู" : "ย่อเมนู"}
            aria-pressed={railMode}
            title={railMode ? "ขยายเมนู ([)" : "ย่อเมนู ([)"}
          >
            <span aria-hidden>{railMode ? "›" : "‹"}</span>
          </button>
        )}
        {groups.map((group) => (
          <div key={group.label} className="ac-side-group">
            <div className="ac-side-label" aria-hidden={railMode}>{group.label}</div>
            {group.items.map((item) => {
              const prefetchUrls = prefetchUrlsFor(item.key);
              return (
              <button
                key={item.key}
                className={`ac-side-item ${activeView === item.key ? "is-active" : ""}`}
                onClick={() => onChangeView(item.key)}
                onMouseEnter={prefetchUrls ? () => prefetchUrls.forEach(prefetch) : undefined}
                onFocus={prefetchUrls ? () => prefetchUrls.forEach(prefetch) : undefined}
                // In rail mode the visible label collapses out, so the
                // tooltip + aria-label become the only way to read the
                // item — wire both unconditionally for safety.
                title={item.label}
                aria-label={item.label}
              >
                <span className="ac-side-icon">
                  <ItemIcon icon={item.icon} />
                </span>
                <span className="ac-side-text">{item.label}</span>
                {typeof item.badge === "number" && (
                  <span className={`ac-badge ${item.badgeClass || ""}`}>{item.badge}</span>
                )}
                {typeof item.secondaryBadge === "number" && item.secondaryBadge > 0 && (
                  <span
                    className={`ac-badge ${item.secondaryBadgeClass || ""}`}
                    title={`เลยกำหนด ${item.secondaryBadge} งาน`}
                  >⚠{item.secondaryBadge}</span>
                )}
              </button>
              );
            })}
          </div>
        ))}

        {/* Room bookmarks (#17) — quick-jump to pinned + recently-opened
            rooms. Hidden in rail mode (no room to show labels) and when
            there's nothing to list. */}
        {!railMode && onOpenRoom && pinnedRooms && pinnedRooms.length > 0 && (
          <RoomBookmarkGroup label="ปักหมุด" rooms={pinnedRooms} onOpenRoom={onOpenRoom} />
        )}
        {!railMode && onOpenRoom && recentRooms && recentRooms.length > 0 && (
          <RoomBookmarkGroup label="เข้าดูล่าสุด" rooms={recentRooms} onOpenRoom={onOpenRoom} />
        )}
      </aside>
      {isOpen && <div className="ac-side-backdrop" onClick={onBackdropClick} />}
    </>
  );
}

/** Quick-jump list of bookmarked rooms (pinned / recent). Each row
 *  opens that room's detail modal. */
function RoomBookmarkGroup({
  label, rooms, onOpenRoom,
}: {
  label: string;
  rooms: RoomView[];
  onOpenRoom: (r: RoomView) => void;
}) {
  return (
    <div className="ac-side-group">
      <div className="ac-side-label">{label}</div>
      {rooms.map((r) => (
        <button
          key={`${r.building}|${r.room}`}
          className="ac-side-item ac-side-room"
          onClick={() => onOpenRoom(r)}
          title={`ห้อง ${r.room} · อาคาร ${r.building} · ${STATUS_LABEL[r.status]}`}
          aria-label={`เปิดห้อง ${r.room} อาคาร ${r.building}`}
        >
          <span className="ac-side-icon">
            <span className="ac-side-dot" style={{ background: STATUS_DOT[r.status] }} />
          </span>
          <span className="ac-side-text">
            {r.room}
            <span className="ac-side-room-bldg">{abbreviateBuilding(r.building)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// Memoized: Home re-renders frequently for reasons unrelated to the
// sidebar (modal typing, view toggles, room selection). All sidebar
// props are memoized or stable refs at the call site, so memo skips
// those reconciliations.
export default memo(AppSidebar);
