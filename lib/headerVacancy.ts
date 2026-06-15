/**
 * Helpers for the building-tab "ห้องว่าง" badge in AppHeader.
 *
 * The badge is global UI surface — every view shares the same topbar.
 * Showing "ห้องว่าง N" on engineer/maintenance views would just be noise
 * (those users aren't shopping for supply), so the parent only feeds
 * vacancy data on supply-relevant views. The single-source enum below
 * stops that allowlist from drifting across page.tsx / tests.
 */

import type { RoomView } from "@/types";

/** Views where the "ห้องว่าง N" badge belongs: home (overview), the
 *  sales dashboard itself, and the three status filters that center on
 *  supply (ready/pending/moveout). */
export const SUPPLY_RELEVANT_VIEWS = new Set<string>([
  "overview", "salespipeline", "ready", "pending", "moveout",
]);

export function isSupplyRelevantView(activeView: string): boolean {
  return SUPPLY_RELEVANT_VIEWS.has(activeView);
}

/** Count rooms with status === "ready" (= "ห้องว่าง") per building. */
export function computeVacancyByBuilding(rooms: RoomView[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rooms) {
    if (r.status === "ready") m[r.building] = (m[r.building] || 0) + 1;
  }
  return m;
}
