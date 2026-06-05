import { describe, expect, it } from "vitest";
import { relativeThaiDate } from "./relativeDate";

function dmy(offsetDays: number, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const NOW = new Date(2026, 5, 5); // 5 June 2026

describe("relativeThaiDate", () => {
  it("returns วันนี้/พรุ่งนี้/เมื่อวาน at the obvious diffs", () => {
    expect(relativeThaiDate(dmy(0, NOW), { now: NOW })).toBe("วันนี้");
    expect(relativeThaiDate(dmy(1, NOW), { now: NOW })).toBe("พรุ่งนี้");
    expect(relativeThaiDate(dmy(-1, NOW), { now: NOW })).toBe("เมื่อวาน");
  });

  it("shows literal day counts when no clamp is set", () => {
    expect(relativeThaiDate(dmy(5, NOW), { now: NOW })).toBe("อีก 5 วัน");
    expect(relativeThaiDate(dmy(-3, NOW), { now: NOW })).toBe("3 วันที่แล้ว");
    expect(relativeThaiDate(dmy(120, NOW), { now: NOW })).toBe("อีก 120 วัน");
  });

  it("falls back to the raw input past clampDays (RoomModal-style)", () => {
    const far = dmy(60, NOW);
    expect(relativeThaiDate(far, { now: NOW, clampDays: 7 })).toBe(far);
    const recent = dmy(5, NOW);
    expect(relativeThaiDate(recent, { now: NOW, clampDays: 7 })).toBe("อีก 5 วัน");
  });

  it("falls back to empty past clampDays when asked", () => {
    expect(relativeThaiDate(dmy(60, NOW), { now: NOW, clampDays: 7, fallback: "empty" })).toBe("");
  });

  it("handles unparseable input via the fallback choice", () => {
    expect(relativeThaiDate("garbage", { now: NOW })).toBe("garbage");
    expect(relativeThaiDate("garbage", { now: NOW, fallback: "empty" })).toBe("");
    expect(relativeThaiDate("", { now: NOW })).toBe("");
  });
});
