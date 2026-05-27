import type { Role } from "@/auth";
import type { SheetRow, RoomView } from "@/types";
import { parseThaiDate, getBangkokNow } from "@/lib/dateUtils";
import { isClosedStatus } from "@/lib/constants";
import { canAccess, type Route } from "@/lib/permissions";

/**
 * Notification derivation — pure, no side effects.
 *
 * The dropdown in the header surfaces "things the user should look at
 * today" without manufacturing new data: every item is computed from
 * the live tasks/rooms feed plus the asset-alert counts that already
 * power the sidebar badges. No DB schema change, no Apps Script call.
 *
 * Role filtering happens here (not in the component) so the counts
 * shown on the bell icon match the contents of the dropdown.
 */

export type NotificationLevel = "critical" | "warning" | "info";

export type NotificationKind =
  | "overdueTasks"
  | "contractsExpiring"
  | "lowStock"
  | "overdueEquipment"
  | "moveoutPending";

export interface NotificationItem {
  kind: NotificationKind;
  level: NotificationLevel;
  /** Emoji rendered as the row's leading glyph. Plain string so we don't
   *  drag in the lucide icon set for items that don't have a clean
   *  semantic equivalent (e.g. "expiring contract"). */
  glyph: string;
  title: string;
  detail: string;
  count: number;
  /** Sidebar route key — when set, clicking the row navigates there. */
  route?: Route;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CONTRACT_WARN_DAYS = 30;

// Default the "today" anchor to Bangkok's calendar day (not the runtime's)
// so a server-side caller can't shift the boundary. On the Bangkok client
// this equals new Date(); see #157 for the same rule in taskUrgency/sla.
function startOfToday(now: Date = getBangkokNow()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysUntil(target: Date, from: Date): number {
  return Math.round((target.getTime() - from.getTime()) / ONE_DAY_MS);
}

function isOpenTask(t: SheetRow): boolean {
  return !isClosedStatus(t.status);
}

interface BuildInput {
  tasks: SheetRow[];
  rooms: RoomView[];
  roles: Role[] | undefined;
  /** Pre-computed counts from useAssetAlertCounts. */
  assetAlerts?: { lowStockParts: number; overdueEquipment: number };
  /** Override for tests — defaults to new Date(). */
  now?: Date;
}

/**
 * Build the ordered notification list for the current user.
 *
 * Order: critical (red) → warning (amber) → info. Within a tier we
 * keep the registration order so the bell's first row is always the
 * single most-urgent item (overdue tasks beats expiring contracts).
 */
export function buildNotifications({ tasks, rooms, roles, assetAlerts, now }: BuildInput): NotificationItem[] {
  const today = startOfToday(now);
  const items: NotificationItem[] = [];

  // ---- 1. Overdue tasks (any role that can see tasks at all) ----
  if (canAccess(roles, "today")) {
    const overdue = tasks.filter((t) => {
      if (!isOpenTask(t)) return false;
      const d = parseThaiDate(t.date);
      if (!d) return false;
      return d.getTime() < today.getTime();
    });
    if (overdue.length > 0) {
      // Worst staleness drives the detail line — "เลย N วัน" focuses
      // attention on the oldest item rather than just the count.
      let worstDays = 0;
      for (const t of overdue) {
        const d = parseThaiDate(t.date);
        if (!d) continue;
        const ageDays = Math.floor((today.getTime() - d.getTime()) / ONE_DAY_MS);
        if (ageDays > worstDays) worstDays = ageDays;
      }
      items.push({
        kind: "overdueTasks",
        level: "critical",
        glyph: "🔴",
        title: "งานเลยกำหนด",
        detail: worstDays > 0 ? `เก่าสุด เลย ${worstDays} วัน` : "ต้องตามด่วน",
        count: overdue.length,
        route: "today",
      });
    }
  }

  // ---- 2. Moveout rooms without inspection/cleaning prep ----
  // Mirrors the new moveout bridge — we don't double-check whether prep
  // tasks exist (Apps Script handles that on flip); here we just count
  // the moveout rooms so sales+management notice they exist.
  if (canAccess(roles, "moveout")) {
    const moveouts = rooms.filter((r) => r.status === "moveout");
    if (moveouts.length > 0) {
      items.push({
        kind: "moveoutPending",
        level: "warning",
        glyph: "🚪",
        title: "ห้องแจ้งย้ายออก",
        detail: "วางแผนทำสะอาด/ตรวจห้องก่อนปิดดีลใหม่",
        count: moveouts.length,
        route: "moveout",
      });
    }
  }

  // ---- 3. Contracts expiring within 30 days ----
  if (canAccess(roles, "tenants")) {
    const expiring = rooms.filter((r) => {
      if (r.status !== "occupied") return false;
      const d = parseThaiDate(r.contractEnd);
      if (!d) return false;
      const days = daysUntil(d, today);
      return days >= 0 && days <= CONTRACT_WARN_DAYS;
    });
    if (expiring.length > 0) {
      // Closest expiry date in the set.
      let soonestDays = CONTRACT_WARN_DAYS + 1;
      for (const r of expiring) {
        const d = parseThaiDate(r.contractEnd);
        if (!d) continue;
        const days = daysUntil(d, today);
        if (days < soonestDays) soonestDays = days;
      }
      const detail = soonestDays <= 0
        ? "หมดวันนี้ — รีบติดต่อ"
        : `เร็วสุดอีก ${soonestDays} วัน`;
      items.push({
        kind: "contractsExpiring",
        level: "warning",
        glyph: "📅",
        title: "สัญญาเช่าใกล้หมด",
        detail,
        count: expiring.length,
        route: "tenants",
      });
    }
  }

  // ---- 4. Low-stock parts (engineer / management) ----
  if (assetAlerts && assetAlerts.lowStockParts > 0 && canAccess(roles, "parts")) {
    items.push({
      kind: "lowStock",
      level: "warning",
      glyph: "📦",
      title: "อะไหล่ใกล้หมด",
      detail: "ต่ำกว่าจุดสั่งซื้อ",
      count: assetAlerts.lowStockParts,
      route: "parts",
    });
  }

  // ---- 5. Overdue equipment service (engineer / management) ----
  if (assetAlerts && assetAlerts.overdueEquipment > 0 && canAccess(roles, "maintenance")) {
    items.push({
      kind: "overdueEquipment",
      level: "warning",
      glyph: "🛠",
      title: "อุปกรณ์ครบกำหนดบำรุง",
      detail: "เลยรอบบำรุงรักษา",
      count: assetAlerts.overdueEquipment,
      route: "maintenance",
    });
  }

  // Sort: critical first, then warning, then info; stable within tier.
  const tier: Record<NotificationLevel, number> = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => tier[a.level] - tier[b.level]);
}

/** Sum of counts — what the bell badge displays. Capped at 99 visually
 *  by the component; the raw number is used for aria-label. */
export function totalNotificationCount(items: NotificationItem[]): number {
  let n = 0;
  for (const it of items) n += it.count;
  return n;
}
