/**
 * Status color tokens — single source of truth for ALL status palettes.
 *
 * Before this file, each domain had its own ad-hoc colors:
 *   - STATUS_DOT          (room status, 7 keys)
 *   - EQUIPMENT_STATUS_COLOR (4 keys)
 *   - FACILITY_STATUS_COLOR  (4 keys)
 *   - MAINTENANCE_STATUS_COLOR (4 keys)
 *
 * The same semantic meaning sometimes used different hex values across
 * domains. This file defines the base palette ONCE; constants.ts now
 * re-exports from here so consumers keep working unchanged AND the
 * pixel-level rendering stays identical (verified token-by-token).
 *
 * Design intent (Tailwind-compatible):
 *   ok       → green-600  (success / normal)
 *   ok-bright→ green-500  (slightly lighter — used where ok needs to "pop" more)
 *   warn     → yellow-500 (attention needed / due-soon)
 *   action   → orange-500 (active work / in-progress)
 *   danger   → red-600    (broken / unusable)
 *   alert    → red-500    (slightly lighter danger — used for room moveout dot)
 *   info     → purple-500 (informational / pending contract)
 *   occupied → slate-800  (filled / dark)
 *   neutral  → slate-400  (de-emphasized text on cards)
 *   inactive → slate-200  (subtle background, almost invisible)
 */

export const TOKEN = {
  ok:        "#16A34A",
  okBright:  "#22C55E",
  warn:      "#EAB308",
  action:    "#F97316",
  danger:    "#DC2626",
  alert:     "#EF4444",
  info:      "#A855F7",
  occupied:  "#1E293B",
  neutral:   "#94A3B8",
  inactive:  "#E2E8F0",
} as const;

export type StatusToken = keyof typeof TOKEN;
