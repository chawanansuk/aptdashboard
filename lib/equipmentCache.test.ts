import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadEquipmentCache,
  saveEquipmentCache,
  invalidateEquipmentCache,
} from "./equipmentCache";
import type { RoomEquipment } from "@/types";

const TTL_MS = 5 * 60 * 1000;

function equip(over: Partial<RoomEquipment> = {}): RoomEquipment {
  return {
    id: "e1", building: "A", room: "101", type: "แอร์", brand: "Daikin",
    installDate: "2025-01-01", lastService: "2026-01-01", status: "ปกติ",
    note: "", creator: "admin@x.com", createdAt: "2025-01-01", ...over,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("equipmentCache", () => {
  it("round-trips per (building, room)", () => {
    const rows = [equip()];
    saveEquipmentCache("A", "101", rows);
    expect(loadEquipmentCache("A", "101")).toEqual(rows);
  });

  it("keeps caches for different rooms isolated", () => {
    saveEquipmentCache("A", "101", [equip({ id: "x" })]);
    saveEquipmentCache("A", "102", [equip({ id: "y", room: "102" })]);
    expect(loadEquipmentCache("A", "101")?.[0].id).toBe("x");
    expect(loadEquipmentCache("A", "102")?.[0].id).toBe("y");
  });

  it("trims building/room when keying (whitespace-insensitive)", () => {
    saveEquipmentCache("A", "101", [equip()]);
    expect(loadEquipmentCache(" A ", " 101 ")).not.toBeNull();
  });

  it("returns null when nothing is cached", () => {
    expect(loadEquipmentCache("A", "999")).toBeNull();
  });

  it("expires after the 5-minute TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    saveEquipmentCache("A", "101", [equip()]);
    expect(loadEquipmentCache("A", "101")).not.toBeNull();
    vi.setSystemTime(TTL_MS + 1);
    expect(loadEquipmentCache("A", "101")).toBeNull();
  });

  it("invalidate removes the entry", () => {
    saveEquipmentCache("A", "101", [equip()]);
    invalidateEquipmentCache("A", "101");
    expect(loadEquipmentCache("A", "101")).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    localStorage.setItem("roomEquipment:v2:A|101", "{bad");
    expect(loadEquipmentCache("A", "101")).toBeNull();
  });
});
