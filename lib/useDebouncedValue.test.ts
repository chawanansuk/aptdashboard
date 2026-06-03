import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebouncedValue", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 150));
    expect(result.current).toBe("a");
  });

  it("delays updates until the value settles", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 150), {
      initialProps: { v: "a" },
    });
    rerender({ v: "ab" });
    rerender({ v: "abc" });
    // Still the original until the timer fires
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe("abc");
  });

  it("only emits the final value when typing faster than the delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 150), {
      initialProps: { v: "1" },
    });
    rerender({ v: "12" });
    act(() => { vi.advanceTimersByTime(100); }); // not yet
    rerender({ v: "123" });                       // resets the timer
    act(() => { vi.advanceTimersByTime(100); });  // still short of 150 since last change
    expect(result.current).toBe("1");
    act(() => { vi.advanceTimersByTime(50); });   // now 150 since "123"
    expect(result.current).toBe("123");
  });
});
