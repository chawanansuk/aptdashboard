import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRoomDensity, ROOM_DENSITY_VALUES } from "./useRoomDensity";

const STORAGE_KEY = "aptdash:roomDensity";

describe("useRoomDensity", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 'comfy' when localStorage is empty", () => {
    const { result } = renderHook(() => useRoomDensity());
    expect(result.current.density).toBe("comfy");
  });

  it("hydrates from localStorage on mount", () => {
    window.localStorage.setItem(STORAGE_KEY, "large");
    const { result } = renderHook(() => useRoomDensity());
    expect(result.current.density).toBe("large");
  });

  it("setDensity persists to localStorage", () => {
    const { result } = renderHook(() => useRoomDensity());
    act(() => result.current.setDensity("compact"));
    expect(result.current.density).toBe("compact");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("compact");
  });

  it("ignores invalid values in storage (falls back to default)", () => {
    window.localStorage.setItem(STORAGE_KEY, "tiny" /* invalid */);
    const { result } = renderHook(() => useRoomDensity());
    expect(result.current.density).toBe("comfy");
  });

  it("ROOM_DENSITY_VALUES exposes the canonical order S→M→L", () => {
    expect(ROOM_DENSITY_VALUES).toEqual(["compact", "comfy", "large"]);
  });
});
