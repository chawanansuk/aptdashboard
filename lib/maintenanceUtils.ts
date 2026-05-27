import type { MaintenanceStatus } from "@/types";

const DUE_SOON_DAYS = 14;

/** Structural shape — works for both RoomEquipment and Facility. */
interface Serviceable {
  intervalDays?: number;
  lastService: string;
  installDate: string;
}

function parseYmd(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Strict range check — JavaScript's Date constructor silently
  // overflows ("2026-13-01" becomes 2027-01-01, "2026-02-30" becomes
  // 2026-03-02). Without this guard, malformed maintenance dates
  // silently passed through and produced wrong "days until service"
  // calculations, hiding overdue equipment from the alert badges.
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  if (y < 1900 || y > 2200) return null;
  const date = new Date(y, mo - 1, d);
  // Final guard: catches Feb 30 / Apr 31 etc. that pass the range
  // check but still overflow into the next month.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Compute next service date as ISO yyyy-MM-dd.
 * Anchor = lastService || installDate. Returns null if no anchor or
 * intervalDays is missing/zero.
 */
export function computeNextService(eq: Serviceable): string | null {
  const interval = Number(eq.intervalDays || 0);
  if (!interval || interval <= 0) return null;
  const anchor = parseYmd(eq.lastService) || parseYmd(eq.installDate);
  if (!anchor) return null;
  const next = new Date(anchor);
  next.setDate(next.getDate() + interval);
  return toYmd(next);
}

/**
 * Days from today until next service. Negative = overdue.
 * Null if next service cannot be computed.
 */
export function daysUntilService(eq: Serviceable): number | null {
  const next = computeNextService(eq);
  if (!next) return null;
  const nextDate = parseYmd(next);
  if (!nextDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = nextDate.getTime() - today.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function getMaintenanceStatus(eq: Serviceable): MaintenanceStatus {
  const interval = Number(eq.intervalDays || 0);
  const hasAnchor = !!(parseYmd(eq.lastService) || parseYmd(eq.installDate));
  // Distinguish two cases that previously both collapsed to "unknown":
  //   - interval set but no anchor date → "needs-date" (data-entry gap:
  //     admin said "service every N days" but gave no starting point,
  //     so the due date is uncomputable and the row needs attention)
  //   - no interval at all → "unknown" (legitimately no schedule)
  if (interval > 0 && !hasAnchor) return "needs-date";
  const days = daysUntilService(eq);
  if (days === null) return "unknown";
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_DAYS) return "due-soon";
  return "ok";
}

/**
 * Technician-facing grouping. The 5 raw MaintenanceStatus values overwhelm
 * the บำรุงรักษา page, so the UI collapses them into 3 buckets that map to
 * "do I act?":
 *   - action  → ต้องบำรุง (overdue + due-soon)
 *   - ok      → ตามรอบ (healthy)
 *   - pending → รอข้อมูล (needs-date + unknown — admin data gap, not a job)
 */
export type MaintenanceGroup = "action" | "ok" | "pending";

export function maintenanceGroup(s: MaintenanceStatus): MaintenanceGroup {
  if (s === "overdue" || s === "due-soon") return "action";
  if (s === "ok") return "ok";
  return "pending"; // needs-date, unknown
}

export function formatDateLabel(s: string): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
