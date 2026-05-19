"use client";

import { useCallback, useState } from "react";

/**
 * useErrorBoundary — bridge from async/event-handler errors into the
 * nearest <ErrorBoundary>.
 *
 * Why this is needed: React error boundaries only catch errors thrown
 * during render. Errors in fetch().catch, setTimeout, click handlers,
 * etc. silently disappear unless we explicitly bring them into render.
 *
 * Usage:
 *   const throwError = useErrorBoundary();
 *   useEffect(() => {
 *     loadStuff().catch(throwError);
 *   }, []);
 *
 * Implementation: stash the error in state, then re-throw it during
 * the next render. The parent ErrorBoundary catches it normally.
 */
export function useErrorBoundary(): (error: unknown) => void {
  const [, setState] = useState<unknown>(null);
  return useCallback((error: unknown) => {
    setState(() => {
      // Setting a function that throws causes the next render to throw,
      // which is what a boundary needs in order to catch.
      throw error instanceof Error ? error : new Error(String(error));
    });
  }, []);
}
