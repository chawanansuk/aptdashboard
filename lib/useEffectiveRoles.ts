"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { Role } from "@/auth";

/**
 * "View as" mode for multi-role users.
 *
 * - actualRoles: the roles the JWT grants (immutable, server truth).
 * - effectiveRoles: which subset of actualRoles to USE for UI gating.
 *   Stored in localStorage so a reload keeps the chosen view.
 *
 * Important: effectiveRoles only affects what the UI shows. Server-side
 * permission checks always use the real roles from the session — so
 * "viewing as sales" can't bypass a server-side rule that requires
 * management. This is a UI-only filter, not a permission downgrade.
 */

const STORAGE_KEY = "aptdash:viewAsRole";
// Same-tab broadcast channel. `storage` events only fire in OTHER tabs,
// so without this every useEffectiveRoles() instance in the SAME tab
// (AppHeader, page.tsx, …) keeps its own viewAs state and a switch made
// in one component never reaches the others until a reload. The setter
// dispatches this event; every instance listens and mirrors it.
const SYNC_EVENT = "aptdash:viewas-change";
const ALL = "all" as const;
type ViewAsValue = Role | typeof ALL;

function isValidView(v: string | null, actual: Role[]): v is ViewAsValue {
  if (!v) return false;
  if (v === ALL) return true;
  return actual.includes(v as Role);
}

export function useEffectiveRoles(): {
  actualRoles: Role[];
  effectiveRoles: Role[];
  viewAs: ViewAsValue;
  setViewAs: (v: ViewAsValue) => void;
  isMultiRole: boolean;
} {
  const { data: session } = useSession();
  const actualRoles = (session?.user?.roles || []) as Role[];
  const isMultiRole = actualRoles.length > 1;

  const [viewAs, setViewAsState] = useState<ViewAsValue>(ALL);

  // Hydrate from localStorage once, after session loads. We can't read
  // localStorage during SSR.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (actualRoles.length === 0) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (isValidView(raw, actualRoles)) {
        setViewAsState(raw);
      } else if (raw) {
        // Stale value (role no longer granted) — drop it
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // private mode / quota — ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualRoles.join("|")]);

  // Same-tab sync: when ANY instance calls setViewAs, every other
  // instance (header badge, page.tsx mode config, sidebar) updates live
  // — no reload. Without this, view-as only re-rendered the component
  // that called the setter (the bug e2e caught).
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onSync(e: Event) {
      const v = (e as CustomEvent<string>).detail;
      if (v === ALL) setViewAsState(ALL);
      else if (isValidView(v, actualRoles)) setViewAsState(v as ViewAsValue);
    }
    window.addEventListener(SYNC_EVENT, onSync as EventListener);
    return () => window.removeEventListener(SYNC_EVENT, onSync as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualRoles.join("|")]);

  // Multi-tab sync — when another tab changes the view-as role, the
  // browser fires a `storage` event here. Mirror it into local state so
  // both tabs show the same mode without a reload. (The setter below
  // writes localStorage in THIS tab; `storage` only fires in OTHER tabs,
  // so there's no echo loop.)
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === null) {
        setViewAsState(ALL); // removed elsewhere → back to "all"
      } else if (isValidView(e.newValue, actualRoles)) {
        setViewAsState(e.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualRoles.join("|")]);

  const setViewAs = useCallback((v: ViewAsValue) => {
    setViewAsState(v);
    if (typeof window === "undefined") return;
    try {
      if (v === ALL) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, v);
      }
    } catch {
      // ignore
    }
    // Broadcast to every other useEffectiveRoles instance in THIS tab
    // (header badge, page mode config, sidebar) so they update live.
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: v }));
  }, []);

  // Memoize so the array reference is stable when neither actualRoles nor
  // viewAs changes. Otherwise every render of a parent re-allocates
  // `[viewAs]`, breaking useMemo/useCallback identity in downstream code.
  const effectiveRoles = useMemo(() => {
    if (viewAs === ALL) return actualRoles;
    return actualRoles.includes(viewAs) ? [viewAs] : actualRoles;
    // Depend on the joined string of actualRoles so identity is stable
    // across unchanged content (session re-fires set a new array even
    // when contents match).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewAs, actualRoles.join("|")]);

  return { actualRoles, effectiveRoles, viewAs, setViewAs, isMultiRole };
}

export const VIEW_AS_ALL = ALL;
export type { ViewAsValue };
