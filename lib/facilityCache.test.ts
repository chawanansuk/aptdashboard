import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadFacilityCache,
  saveFacilityCache,
  invalidateFacilityCache,
} from "./facilityCache";
import type { Facility } from "@/types";

const KEY = "facilities:v1"; // mirrors the private constant
const TTL_MS = 5 * 60 * 1000;

function facility(over: Partial<Facility> = {}): Facility {
  return {
    id: "f1", building: "A", type: "ลิฟต์", name: "ลิฟต์ #1",
    installDate: "2025-01-01", lastService: "2026-01-01", status: "ปกติ",
    note: "", creator: "admin@x.com", createdAt: "2025-01-01", ...over,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("facilityCache", () => {
  it("round-trips the facility list", () => {
    const rows = [facility(), facility({ id: "f2" })];
    saveFacilityCache(rows);
    expect(loadFacilityCache()).toEqual(rows);
  });

  it("returns null when nothing is cached", () => {
    expect(loadFacilityCache()).toBeNull();
  });

  it("expires after the 5-minute TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    saveFacilityCache([facility()]);
    expect(loadFacilityCache()).not.toBeNull();
    vi.setSystemTime(TTL_MS + 1);
    expect(loadFacilityCache()).toBeNull();
  });

  it("invalidate removes the entry", () => {
    saveFacilityCache([facility()]);
    invalidateFacilityCache();
    expect(loadFacilityCache()).toBeNull();
  });

  it("returns null on malformed JSON / non-array rows", () => {
    localStorage.setItem(KEY, "{bad");
    expect(loadFacilityCache()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ rows: "x", savedAt: Date.now() }));
    expect(loadFacilityCache()).toBeNull();
  });
});
