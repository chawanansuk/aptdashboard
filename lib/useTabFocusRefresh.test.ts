/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTabFocusRefresh } from "./useTabFocusRefresh";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
});
afterEach(() => vi.useRealTimers());

describe("useTabFocusRefresh", () => {
  it("fires onRefresh on focus once past the min interval (after debounce)", () => {
    const cb = vi.fn();
    renderHook(() => useTabFocusRefresh(cb, 1000));
    act(() => { vi.advanceTimersByTime(2000); }); // pass min interval
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(cb).not.toHaveBeenCalled(); // still inside the 150ms debounce
    act(() => { vi.advanceTimersByTime(200); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("debounces a simultaneous visibilitychange + focus into one refresh", () => {
    const cb = vi.fn();
    renderHook(() => useTabFocusRefresh(cb, 1000));
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(200);
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("skips a refresh that lands within the min interval", () => {
    const cb = vi.fn();
    renderHook(() => useTabFocusRefresh(cb, 1000));
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { window.dispatchEvent(new Event("focus")); vi.advanceTimersByTime(200); });
    expect(cb).toHaveBeenCalledTimes(1);
    // Second trigger right after → only ~200ms since last → skipped
    act(() => { window.dispatchEvent(new Event("focus")); vi.advanceTimersByTime(200); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the tab is hidden", () => {
    const cb = vi.fn();
    renderHook(() => useTabFocusRefresh(cb, 1000));
    act(() => { vi.advanceTimersByTime(2000); });
    setVisibility("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); vi.advanceTimersByTime(200); });
    expect(cb).not.toHaveBeenCalled();
  });
});
