/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMediaQuery } from "./useMediaQuery";

// Minimal matchMedia stub we can drive: each instance tracks its listeners
// and a `matches` value we can flip to simulate a viewport resize.
function installMatchMedia(initialMatches: boolean) {
  let listeners: Array<() => void> = [];
  const mql = {
    matches: initialMatches,
    media: "",
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => {
      listeners = listeners.filter((l) => l !== cb);
    },
  };
  const fn = vi.fn().mockReturnValue(mql);
  vi.stubGlobal("matchMedia", fn);
  return {
    fn,
    set(matches: boolean) {
      mql.matches = matches;
      act(() => listeners.forEach((l) => l()));
    },
    listenerCount: () => listeners.length,
  };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("useMediaQuery", () => {
  it("resolves to the current match value on mount", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1281px)"));
    expect(result.current).toBe(true);
  });

  it("starts false then flips when the query begins matching", () => {
    const mm = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1281px)"));
    expect(result.current).toBe(false);
    mm.set(true);
    expect(result.current).toBe(true);
    mm.set(false);
    expect(result.current).toBe(false);
  });

  it("unsubscribes the listener on unmount", () => {
    const mm = installMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 1281px)"));
    expect(mm.listenerCount()).toBe(1);
    unmount();
    expect(mm.listenerCount()).toBe(0);
  });

  it("returns false (no throw) when matchMedia is unavailable", () => {
    // No matchMedia on the global → SSR-like / old environment.
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1281px)"));
    expect(result.current).toBe(false);
  });
});
