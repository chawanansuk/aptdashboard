import type { Role } from "@/auth";

/**
 * Mode personality config — defines how each role's "workspace" looks
 * and behaves. Single source of truth for per-role differences in:
 * - landing view, defaults, button labels
 * - welcome hero copy
 * - accent color (CSS var set via `<html data-mode>`)
 * - sidebar group order
 *
 * View-as flow: when a multi-role user picks View-as, `effectiveRoles`
 * narrows to one role → that becomes the active mode → personality
 * swaps without re-login.
 */

export type Mode = "sales" | "engineer" | "management";

/** Stats passed into the welcome hero greeting function. */
export interface GreetingStats {
  vacant: number;
  occupied: number;
  total: number;
  occupancyRate: number;     // 0..1
  tasksToday: number;
  /** งานที่ยังไม่ปิดและเลยวันนัดมาแล้ว (UI audit r20) — เดิม hero บอก
   *  "ระบบเรียบร้อย ไม่มีงานเร่งด่วน" ทั้งที่ sidebar เตือน ⚠ งานเลยกำหนด. */
  tasksOverdue: number;
  /** Rooms with moveout notice — re-sell pipeline signal for sales. */
  moveoutCount: number;
  /**
   * Contracts expiring this calendar month. Kept for management mode
   * (oversight) but unused in sales mode — at this property contracts
   * auto-renew, so the actionable signal is moveout, not expiry.
   */
  expiringContractsThisMonth: number;
  maintenanceOverdue: number;
  maintenanceDueSoon: number;
  monthlyIncome: number;
}

export interface ModeConfig {
  mode: Mode;
  label: string;                // "Sales Mode"
  shortLabel: string;           // "Sales"
  emoji: string;                // visual identity glyph
  /** Initial activeView when user lands (if they haven't navigated). */
  defaultLandingView: string;
  /** Default task type pre-selected in AddTaskModal. */
  defaultTaskType: string;
  /** Add button label in header. */
  addButtonLabel: string;
  /** Initial tab when opening RoomModal. */
  roomModalDefaultTab: "info" | "equipment";
  /** Hex accent color — set as CSS var on `<html data-mode>`. */
  accentHex: string;
  /** Tagline shown under user name in welcome hero. */
  tagline: string;
  /** Dynamic greeting subtitle — receives current stats. */
  greetingSubtitle: (stats: GreetingStats) => string;
  /**
   * Preferred sidebar group order (by group label). Groups not listed
   * fall to the end in their original order. Used by AppSidebar to
   * reorder its output.
   */
  sidebarGroupOrder: string[];
}

/**
 * Per-mode config. Tuned for each role's daily workflow:
 * - sales: customer-first → land on tenants, contracts upfront
 * - engineer: work-first → land on today's tasks, maintenance pulled up
 * - management: oversight → land on overview KPI dashboard
 */
export const MODE_CONFIG: Record<Mode, ModeConfig> = {
  sales: {
    mode: "sales",
    label: "โหมดขาย",
    shortLabel: "ขาย",
    emoji: "🌅",
    defaultLandingView: "salespipeline",
    defaultTaskType: "ชมห้อง",
    addButtonLabel: "+ นัดลูกค้า",
    roomModalDefaultTab: "info",
    accentHex: "#0EA5E9", // sky-500 — friendly, customer-facing
    tagline: "ขายห้อง · ดูแลผู้เช่า",
    greetingSubtitle: (s) => {
      const parts: string[] = [];
      if (s.tasksOverdue > 0) parts.push(`⚠ งานเลยกำหนด ${s.tasksOverdue} รายการ`);
      if (s.vacant > 0) parts.push(`ห้องว่าง ${s.vacant} ห้อง`);
      if (s.moveoutCount > 0) {
        parts.push(`รอย้ายออก ${s.moveoutCount} ห้อง`);
      }
      if (s.tasksToday > 0) parts.push(`งานวันนี้ ${s.tasksToday} รายการ`);
      return parts.length ? parts.join(" · ") : "ยังไม่มีงานเร่งด่วน";
    },
    sidebarGroupOrder: ["วันนี้", "สถานะห้อง", "ดูข้อมูล", "ทรัพย์สิน"],
  },

  engineer: {
    mode: "engineer",
    label: "โหมดช่าง",
    shortLabel: "ช่าง",
    emoji: "🔧",
    defaultLandingView: "engineerkanban",
    defaultTaskType: "ซ่อม",
    addButtonLabel: "+ แจ้งซ่อม",
    roomModalDefaultTab: "equipment",
    accentHex: "#0D9488", // teal-600 — cool, technical
    tagline: "งานซ่อม · บำรุงรักษา",
    greetingSubtitle: (s) => {
      const parts: string[] = [];
      if (s.tasksOverdue > 0) parts.push(`⚠ งานเลยกำหนด ${s.tasksOverdue} รายการ`);
      if (s.maintenanceOverdue > 0) {
        parts.push(`บำรุงเลยกำหนด ${s.maintenanceOverdue} ชิ้น`);
      }
      if (s.tasksToday > 0) parts.push(`งานวันนี้ ${s.tasksToday} งาน`);
      if (s.maintenanceDueSoon > 0) {
        parts.push(`ใกล้ครบรอบ ${s.maintenanceDueSoon} ชิ้น`);
      }
      return parts.length ? parts.join(" · ") : "ระบบเรียบร้อย ไม่มีงานเร่งด่วน";
    },
    sidebarGroupOrder: ["วันนี้", "ทรัพย์สิน", "สถานะห้อง", "ดูข้อมูล"],
  },

  management: {
    mode: "management",
    label: "โหมดจัดการ",
    shortLabel: "จัดการ",
    emoji: "📊",
    defaultLandingView: "overview",
    defaultTaskType: "ย้ายเข้า",
    addButtonLabel: "+ เพิ่มงาน",
    roomModalDefaultTab: "info",
    accentHex: "#6366F1", // indigo-500 — strategic, neutral authority
    tagline: "ภาพรวม · การเงิน",
    greetingSubtitle: (s) => {
      const parts: string[] = [];
      if (s.tasksOverdue > 0) parts.push(`⚠ งานเลยกำหนด ${s.tasksOverdue} รายการ`);
      const rate = Math.round(s.occupancyRate * 100);
      parts.push(`อัตราเช่า ${rate}%`);
      if (s.monthlyIncome > 0) {
        parts.push(`รายได้ ${s.monthlyIncome.toLocaleString("th-TH")} ฿`);
      }
      if (s.expiringContractsThisMonth > 0) {
        parts.push(`สัญญาหมดเดือนนี้ ${s.expiringContractsThisMonth} ราย`);
      }
      return parts.join(" · ");
    },
    sidebarGroupOrder: ["วันนี้", "ดูข้อมูล", "สถานะห้อง", "ทรัพย์สิน"],
  },
};

/**
 * Derive which mode personality to render from a user's effective roles.
 *
 * - effectiveRoles = single role (View-as picked) → that mode
 * - effectiveRoles = multi (View-as = "all") → pick the primary
 *   (first in array; ALLOWED_USERS env order)
 * - Empty / unknown → "management" as safest fallback (shows everything,
 *   no accidental restriction)
 */
export function deriveMode(roles: Role[] | undefined | null): Mode {
  if (!roles || roles.length === 0) return "management";
  const primary = roles[0];
  if (primary === "management" || primary === "engineer" || primary === "sales") {
    return primary;
  }
  return "management";
}

/** Convenience: resolve mode + config in one call. */
export function getModeConfig(roles: Role[] | undefined | null): ModeConfig {
  return MODE_CONFIG[deriveMode(roles)];
}
