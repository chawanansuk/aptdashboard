"use client";

import { useEffect, useRef } from "react";

/**
 * Trigger a refresh when the user returns to the tab.
 *
 * Fires on `visibilitychange` (tab becomes visible) and `focus` (window
 * regains focus). Debounced so the two events that often fire together
 * only trigger one refresh.
 *
 * Skips the first call after mount — the initial fetch handles that.
 * Only refreshes if more than `minIntervalMs` has elapsed since the
 * last refresh (default 30s) to avoid hammering the upstream.
 */
export function useTabFocusRefresh(
  onRefresh: () => void,
  minIntervalMs = 30_000
): void {
  const lastRefreshAt = useRef<number>(Date.now());
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  useEffect(() => {
    if (typeof window === "undefined") return;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    function trigger() {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        const now = Date.now();
        if (now - lastRefreshAt.current < minIntervalMs) return;
        lastRefreshAt.current = now;
        cbRef.current();
      }, 150);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") trigger();
    }
    function onFocus() {
      trigger();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      if (debounce) clearTimeout(debounce);
    };
  }, [minIntervalMs]);
}
