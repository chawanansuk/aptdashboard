import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadCache, saveCache } from "./cacheData";
import type { RoomRow, SheetRow } from "@/types";

// Mirrors the private constants in cacheData.ts (kept in sync deliberately).
const KEY = "dashboardCache:v1";
const TTL_MS = 24 * 60 * 60 * 1000;

const rooms: RoomRow[] = [
  { building: "A", room: "101", floor: "1", price: "5000", status: "ว่าง", tenant: "", phone: "", contractEnd: "" },
];
const tasks: SheetRow[] = [
  { date: "25/05/2026", type: "ทำสะอาด", building: "A", room: "101", customer: "", phone: "", note: "", status: "รอ" },
];

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("cacheData", () => {
  it("round-trips rooms + tasks through save → load", () => {
    saveCache(rooms, tasks);
    const c = loadCache();
    expect(c?.rooms).toEqual(rooms);
    expect(c?.tasks).toEqual(tasks);
    expect(typeof c?.savedAt).toBe("number");
  });

  it("returns null when there's nothing cached", () => {
    expect(loadCache()).toBeNull();
  });

  it("returns null once the entry is older than the 24h TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    saveCache(rooms, tasks);
    expect(loadCache()).not.toBeNull();
    vi.setSystemTime(TTL_MS + 1);
    expect(loadCache()).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadCache()).toBeNull();
  });

  it("returns null when savedAt is missing/not a number", () => {
    localStorage.setItem(KEY, JSON.stringify({ rooms, tasks }));
    expect(loadCache()).toBeNull();
  });

  it("returns null when rooms/tasks aren't arrays", () => {
    localStorage.setItem(KEY, JSON.stringify({ rooms: "x", tasks: [], savedAt: Date.now() }));
    expect(loadCache()).toBeNull();
  });
});
