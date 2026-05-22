/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePersistedString } from "./usePersistedString";

beforeEach(() => {
  window.localStorage.clear();
});

describe("usePersistedString", () => {
  it("returns fallback when nothing stored", () => {
    const { result } = renderHook(() => usePersistedString("test:a", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("hydrates from localStorage on mount", () => {
    window.localStorage.setItem("aptdash:test:b", "stored-value");
    const { result } = renderHook(() => usePersistedString("test:b", "default"));
    // After mount effect runs
    expect(result.current[0]).toBe("stored-value");
  });

  it("setter writes to localStorage", () => {
    const { result } = renderHook(() => usePersistedString("test:c", "x"));
    act(() => result.current[1]("y"));
    expect(result.current[0]).toBe("y");
    expect(window.localStorage.getItem("aptdash:test:c")).toBe("y");
  });

  it("auto-prefixes key with aptdash: when caller omits it", () => {
    const { result } = renderHook(() => usePersistedString("plain", "x"));
    act(() => result.current[1]("y"));
    expect(window.localStorage.getItem("aptdash:plain")).toBe("y");
  });

  it("preserves caller-supplied aptdash: prefix (no double prefix)", () => {
    const { result } = renderHook(() => usePersistedString("aptdash:test:d", "x"));
    act(() => result.current[1]("y"));
    expect(window.localStorage.getItem("aptdash:test:d")).toBe("y");
    expect(window.localStorage.getItem("aptdash:aptdash:test:d")).toBeNull();
  });

  it("clears invalid stored value and uses fallback", () => {
    window.localStorage.setItem("aptdash:test:e", "stale-building");
    const { result } = renderHook(() =>
      usePersistedString("test:e", "fresh", (v) => v === "ok")
    );
    expect(result.current[0]).toBe("fresh");
    expect(window.localStorage.getItem("aptdash:test:e")).toBeNull();
  });

  it("keeps valid stored value when isValid passes", () => {
    window.localStorage.setItem("aptdash:test:f", "ok");
    const { result } = renderHook(() =>
      usePersistedString("test:f", "fresh", (v) => v === "ok")
    );
    expect(result.current[0]).toBe("ok");
  });
});
