"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/reportError";

/**
 * Mounts window-level error handlers ONCE at the app root.
 *
 * ErrorBoundary catches render-tree errors; this picks up everything
 * else that would otherwise vanish into devtools alone:
 *
 *   - synchronous errors in event handlers (`window.onerror`)
 *   - rejected promises with no `.catch` (`unhandledrejection`)
 *   - assets that fail to load (we skip these — too noisy)
 *
 * Each error is forwarded to `lib/reportError` (which dedups +
 * sendBeacons to /api/client-error) and then we let the default browser
 * handling continue. We deliberately do NOT call `e.preventDefault()`:
 * production users see no UI change either way, and devtools surfacing
 * helps anyone debugging.
 */
export default function GlobalErrorHandlers() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onError(ev: ErrorEvent) {
      reportClientError({
        message: ev.message || (ev.error && (ev.error as Error).message) || "window.onerror",
        stack: ev.error instanceof Error ? ev.error.stack : undefined,
        source: "window.onerror",
      });
    }

    function onRejection(ev: PromiseRejectionEvent) {
      const reason: unknown = ev.reason;
      const message =
        reason instanceof Error ? reason.message
        : typeof reason === "string" ? reason
        : "unhandled promise rejection";
      reportClientError({
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
        source: "unhandledrejection",
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
