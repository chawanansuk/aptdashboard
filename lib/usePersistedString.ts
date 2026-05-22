"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Tiny hook: useState backed by localStorage so the value survives
 * page reloads. Use for UI preferences (active building, active
 * view, search filter chip, etc.) — NOT for security-sensitive
 * state since localStorage is plain text + readable by any JS on
 * the origin.
 *
 * SSR safe: initial render uses `fallback` (no window access),
 * then a useEffect rehydrates from localStorage on mount. This
 * avoids the "stored value flicker into wrong state on first
 * paint" hydration mismatch.
 *
 * Optional `isValid` guard lets the caller reject stale values
 * (e.g. a building name that no longer exists in the data). When
 * invalid, the fallback is used and the stored value cleared.
 */
export function usePersistedString(
  key: string,
  fallback: string,
  isValid: (v: string) => boolean = () => true,
): [string, (v: string) => void] {
  const storageKey = key.startsWith("aptdash:") ? key : `aptdash:${key}`;

  const [value, setValue] = useState<string>(fallback);

  // Hydrate from localStorage on mount (client only). Effect-based
  // hydration keeps SSR markup deterministic.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw && isValid(raw)) {
        setValue(raw);
      } else if (raw) {
        // Stored value invalid (e.g. a removed building). Clear it
        // so we don't keep falling back on every mount.
        window.localStorage.removeItem(storageKey);
      }
    } catch { /* localStorage disabled / quota — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch { /* ignore */ }
    },
    [storageKey],
  );

  return [value, set];
}
