/**
 * Sales dashboard (ภาพรวมขาย v2) — design-token source of truth.
 *
 * SCOPED to the sales view only. The app-wide status palette lives in
 * `lib/statusTokens.ts` (TOKEN) and is intentionally NOT touched here —
 * the redesign uses a different, softer navy-friendly palette that we
 * keep isolated so engineer/rooms/equipment views stay pixel-identical.
 *
 * Single source of truth: every sales surface (card, grid cell, legend,
 * KPI) reads its color from `SALES_STATUS_META` here. Components forward
 * these into CSS via inline custom properties (`--st-base/-tint/-border`)
 * so `sales.module.css` owns layout/hover but never hardcodes a hex —
 * change a status color once here and it propagates everywhere.
 */

import type { RoomStatus } from "@/types";

/** The four sales-facing room states. The app's 7-key RoomStatus collapses
 *  into these via `toSalesStatus` — qc/repair/inactive read as "occupied"
 *  (grey) since to a salesperson they're simply "not sellable yet". */
export type SalesStatus = "available" | "pending" | "occupied" | "moveout";

export interface StatusMeta {
  /** Thai label shown on pills / legend / tooltips. */
  label: string;
  /** Solid accent — dot, left bar, legend swatch. */
  base: string;
  /** Faint fill behind a card / grid cell. */
  tint: string;
  /** Card / cell border. */
  border: string;
}

/** Display + filter order (most actionable for sales first). */
export const SALES_STATUS_ORDER: SalesStatus[] = [
  "available", "pending", "moveout", "occupied",
];

export const SALES_STATUS_META: Record<SalesStatus, StatusMeta> = {
  available: {
    label: "พร้อมขาย",
    base: "#34D399",
    tint: "rgba(52,211,153,.12)",
    border: "rgba(52,211,153,.30)",
  },
  pending: {
    label: "รอสัญญา",
    base: "#A788FA",
    tint: "rgba(167,139,250,.12)",
    border: "rgba(167,139,250,.30)",
  },
  occupied: {
    label: "มีผู้เช่า",
    base: "#7C8AA3",
    tint: "rgba(124,138,163,.07)",
    border: "rgba(124,138,163,.18)",
  },
  moveout: {
    label: "แจ้งย้ายออก",
    base: "#FB7185",
    tint: "rgba(251,113,133,.12)",
    border: "rgba(251,113,133,.30)",
  },
};

/**
 * Collapse the app's 7-key RoomStatus into a sales-facing 4-key status.
 * qc / repair / inactive → "occupied" (grey, not sellable). The room's
 * real `rawStatus` is still shown verbatim in the detail drawer, so no
 * information is lost — only the headline color is simplified.
 */
export function toSalesStatus(status: RoomStatus): SalesStatus {
  switch (status) {
    case "ready":    return "available";
    case "pending":  return "pending";
    case "moveout":  return "moveout";
    case "occupied": return "occupied";
    // qc / repair / inactive — occupied-grey to a salesperson.
    default:         return "occupied";
  }
}

export function salesMeta(status: RoomStatus): StatusMeta {
  return SALES_STATUS_META[toSalesStatus(status)];
}

/** CSS custom-property bag — spread into a `style={}` so sales.module.css
 *  can `var(--st-base)` etc. without ever hardcoding a status hex. */
export function statusVars(status: SalesStatus): Record<string, string> {
  const m = SALES_STATUS_META[status];
  return { "--st-base": m.base, "--st-tint": m.tint, "--st-border": m.border };
}

/* ====================================================================
 * Appointment kinds — รางนัดหมาย tag colors. Separate axis from room
 * status (these describe an event, not a room).
 * ==================================================================== */

export type ApptKind = "view" | "movein" | "moveout";

export interface ApptKindMeta {
  label: string;
  base: string;
  tint: string;
}

/** Maps a sheet task `type` to its appointment-tag identity. Sales-side
 *  task types only — anything else returns null (the rail skips it). */
export const APPT_KIND_META: Record<ApptKind, ApptKindMeta> = {
  view:    { label: "ชมห้อง",  base: "#FBBF24", tint: "rgba(251,191,36,.12)" },  // เหลือง
  movein:  { label: "ย้ายเข้า", base: "#60A5FA", tint: "rgba(96,165,250,.12)" },  // น้ำเงิน
  moveout: { label: "ย้ายออก", base: "#FB7185", tint: "rgba(251,113,133,.12)" }, // แดง
};

export function apptKindFromType(taskType: string): ApptKind | null {
  switch (taskType) {
    case "ชมห้อง":  return "view";
    case "ย้ายเข้า": return "movein";
    case "ย้ายออก": return "moveout";
    default:        return null;
  }
}
