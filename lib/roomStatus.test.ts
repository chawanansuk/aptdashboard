import { describe, expect, it } from "vitest";
import {
  normalizeRoomStatus,
  isKnownRoomStatus,
  STATUS_FROM_ROOM,
} from "./roomStatus";

describe("normalizeRoomStatus (Task 11+31)", () => {
  describe("occupied aliases coalesce to 'occupied'", () => {
    it("'มีผู้เช่า' (canonical)", () => {
      expect(normalizeRoomStatus("มีผู้เช่า")).toBe("occupied");
    });
    it("'มีคนอยู่' (legacy spelling)", () => {
      expect(normalizeRoomStatus("มีคนอยู่")).toBe("occupied");
    });
    it("'อยู่' (terse legacy)", () => {
      expect(normalizeRoomStatus("อยู่")).toBe("occupied");
    });
  });

  describe("repair: 'ปรับปรุง' coalesces with 'ซ่อม' (owner request)", () => {
    it("'ซ่อม'", () => {
      expect(normalizeRoomStatus("ซ่อม")).toBe("repair");
    });
    it("'ปรับปรุง' — operationally same as ซ่อม at this property", () => {
      expect(normalizeRoomStatus("ปรับปรุง")).toBe("repair");
    });
    it("'รอเข้าซ่อม'", () => {
      expect(normalizeRoomStatus("รอเข้าซ่อม")).toBe("repair");
    });
  });

  describe("vacancy / pending", () => {
    it("'ว่าง' → ready", () => {
      expect(normalizeRoomStatus("ว่าง")).toBe("ready");
    });
    it("'รอสัญญา' → pending", () => {
      expect(normalizeRoomStatus("รอสัญญา")).toBe("pending");
    });
    it("'แจ้งย้ายออก' → moveout", () => {
      expect(normalizeRoomStatus("แจ้งย้ายออก")).toBe("moveout");
    });
  });

  describe("outliers map defensively", () => {
    it("'ER' (data-corruption outlier) → inactive (not dropped)", () => {
      expect(normalizeRoomStatus("ER")).toBe("inactive");
    });
    it("'ห้องสำรอง' → inactive", () => {
      expect(normalizeRoomStatus("ห้องสำรอง")).toBe("inactive");
    });
  });

  describe("edge cases", () => {
    it("trims whitespace", () => {
      expect(normalizeRoomStatus("  มีผู้เช่า  ")).toBe("occupied");
    });
    it("undefined → inactive", () => {
      expect(normalizeRoomStatus(undefined)).toBe("inactive");
    });
    it("null → inactive", () => {
      expect(normalizeRoomStatus(null)).toBe("inactive");
    });
    it("empty string → inactive", () => {
      expect(normalizeRoomStatus("")).toBe("inactive");
    });
    it("unknown value → inactive (safe default, not silently dropped)", () => {
      expect(normalizeRoomStatus("zzz-unknown")).toBe("inactive");
    });
  });

  it("STATUS_FROM_ROOM table is complete for all enum members", () => {
    const enumMembers = new Set(Object.values(STATUS_FROM_ROOM));
    expect(enumMembers).toContain("occupied");
    expect(enumMembers).toContain("ready");
    expect(enumMembers).toContain("pending");
    expect(enumMembers).toContain("moveout");
    expect(enumMembers).toContain("qc");
    expect(enumMembers).toContain("repair");
    expect(enumMembers).toContain("inactive");
  });
});

describe("isKnownRoomStatus", () => {
  it("returns true for known aliases", () => {
    expect(isKnownRoomStatus("มีคนอยู่")).toBe(true);
    expect(isKnownRoomStatus("ER")).toBe(true);
  });
  it("returns false for unknown", () => {
    expect(isKnownRoomStatus("zzz")).toBe(false);
    expect(isKnownRoomStatus("")).toBe(false);
    expect(isKnownRoomStatus(null)).toBe(false);
  });
});
