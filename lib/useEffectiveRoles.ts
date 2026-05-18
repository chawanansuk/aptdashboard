"use client";

import { useCallback, useEffect, useState } from "react";
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
  }, []);

  const effectiveRoles =
    viewAs === ALL ? actualRoles : actualRoles.includes(viewAs) ? [viewAs] : actualRoles;

  return { actualRoles, effectiveRoles, viewAs, setViewAs, isMultiRole };
}

export const VIEW_AS_ALL = ALL;
export type { ViewAsValue };
