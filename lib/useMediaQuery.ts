"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query and re-render when it flips.
 *
 * SSR-safe: returns `false` on the server and the first client render
 * (matchMedia isn't available during SSR), then resolves to the real
 * value in a mount effect — so it never causes a hydration mismatch.
 * Callers that need the "real" value before paint should treat the
 * first `false` as "unknown / not yet measured".
 *
 * Pass a query from `lib/breakpoints` (MQ.*) so thresholds stay shared
 * with the CSS rather than hard-coded per call site.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update(); // sync to the current value on mount / query change
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}
