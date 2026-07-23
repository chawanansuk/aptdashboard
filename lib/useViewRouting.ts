"use client";

/**
 * View routing for the dashboard SPA — PR 2 of the page.tsx breakup.
 *
 * Owns the `activeView` state (persisted across reloads) plus the two
 * routing effects that used to live inline in app/page.tsx:
 *
 *   1. Mode landing — on first load and on every View-as mode switch,
 *      move to the mode's home view (sales → salespipeline, engineer →
 *      engineerkanban, management → overview). Latched per mode so
 *      in-mode navigation isn't fought.
 *
 *   2. Route guard — if the (effective) role can't access the current
 *      view, redirect to the mode landing (or the generic default) and
 *      toast — except when the redirect was caused by a mode switch,
 *      which isn't the user's mistake.
 *
 * Logic is a verbatim move; the only change is that the inputs
 * (role/roles/mode) arrive as parameters instead of closures.
 */

import { useEffect, useRef } from "react";
import type { Role } from "@/auth";
import type { RoomStatus } from "@/types";
import { usePersistedString } from "@/lib/usePersistedString";
import { canAccess, getDefaultRoute, type Route } from "@/lib/permissions";
import { toast } from "@/lib/toast";

export type ActiveView =
  | "overview" | "today" | RoomStatus
  | "income" | "tenants" | "calendar" | "maintenance" | "facilities"
  | "parts" | "vehicles" | "leads" | "recurring" | "maintlog"
  | "salespipeline" | "engineerkanban" | "reports";

export const VALID_VIEWS: ActiveView[] = [
  "overview", "today", "occupied", "ready", "pending", "moveout", "qc", "repair", "inactive",
  "income", "tenants", "calendar", "maintenance", "facilities", "parts", "vehicles", "leads", "recurring",
  "maintlog", "salespipeline", "engineerkanban", "reports",
];

export interface ViewRoutingOptions {
  /** Primary role — undefined while the session is still loading; the
   *  route guard waits for it so we don't redirect on a blank session. */
  role: Role | undefined;
  /** Effective role set (View-as filtered, falls back to actual). */
  roles: Role[];
  /** Raw effective list — empty means signed out; resets the landing
   *  latch so a NEW user in the same SPA session still gets landed. */
  effectiveRoles: Role[];
  /** Current mode (sales/engineer/management) from modeConfig. */
  mode: string;
  /** The mode's home view (modeConfig.defaultLandingView). */
  defaultLandingView: string;
}

export interface ViewRouting {
  activeView: ActiveView;
  setActiveView: (v: ActiveView) => void;
}

export function useViewRouting({
  role, roles, effectiveRoles, mode, defaultLandingView,
}: ViewRoutingOptions): ViewRouting {
  // Persisted so a refresh lands the user back in their last context.
  const [activeViewRaw, setActiveViewRaw] = usePersistedString(
    "activeView",
    "overview",
    (v) => (VALID_VIEWS as string[]).includes(v),
  );
  const activeView = activeViewRaw as ActiveView;
  const setActiveView = (v: ActiveView) => setActiveViewRaw(v);

  // ---- Mode landing ----
  // Re-apply mode default landing view whenever the effective mode
  // changes (initial load OR View-as switch). Without this, switching
  // from sales → engineer would leave activeView on a sales-only route
  // and trigger the "ไม่มีสิทธิ์เข้าถึงหน้านี้" toast incorrectly.
  const lastLandedModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!effectiveRoles || effectiveRoles.length === 0) {
      // Sign-out / role-loss: reset the ref so a NEW user who signs in
      // within the same SPA session will still get redirected to their
      // landing view (previous ref would mark "already landed").
      lastLandedModeRef.current = null;
      return;
    }
    if (lastLandedModeRef.current === mode) return;
    lastLandedModeRef.current = mode;
    const target = defaultLandingView as ActiveView;
    if (target && target !== activeView && canAccess(roles, target as Route)) {
      setActiveView(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, effectiveRoles.join("|")]);

  // ---- Route guard ----
  // Redirect when the effective role set can't access the current view
  // (View-as also redirects: server would still allow the real role,
  // but the UI should match what the filtered view can see). Track the
  // mode the guard last saw — when the mode changes, the landing effect
  // above moves activeView; we suppress the "ไม่มีสิทธิ์" toast for that
  // one tick because the user didn't try to enter a forbidden view,
  // they just switched modes.
  const guardSeenModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!role) return; // session still loading
    const justSwitchedMode = guardSeenModeRef.current !== mode;
    guardSeenModeRef.current = mode;

    if (!canAccess(roles, activeView as Route)) {
      // Prefer the mode's home page when redirecting — feels natural after
      // a View-as switch. Fall back to the generic default if the mode
      // landing also isn't accessible (defensive).
      const modeLanding = defaultLandingView as Route;
      const fallback: Route = canAccess(roles, modeLanding)
        ? modeLanding
        : getDefaultRoute(roles);
      setActiveView(fallback as ActiveView);
      // Only surface the error toast when the redirect is NOT caused by a
      // mode switch (e.g. user navigated to a forbidden view via cmdk).
      if (!justSwitchedMode) {
        toast.error("ไม่มีสิทธิ์เข้าถึงหน้านี้");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, activeView, roles.join("|"), mode]);

  return { activeView, setActiveView };
}
