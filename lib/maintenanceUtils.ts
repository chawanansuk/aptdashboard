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
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
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
  const days = daysUntilService(eq);
  if (days === null) return "unknown";
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_DAYS) return "due-soon";
  return "ok";
}

export function formatDateLabel(s: string): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
