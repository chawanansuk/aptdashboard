import { describe, expect, it } from "vitest";
import { findLandedTask } from "./writeVerify";
import type { SheetRow } from "@/types";

const row = (over: Partial<SheetRow>): SheetRow => ({
  date: "11/09/2026", type: "ชมห้อง", building: "มีทอง", room: "204",
  customer: "", phone: "", note: "", status: "", ...over,
});

describe("findLandedTask (r32 — เช็คว่างานเข้าแล้วหลัง Google ตอบช้า)", () => {
  const pending = { date: "2026-09-11", type: "ชมห้อง", building: "มีทอง", room: "204", customer: "คุณนก", phone: "081-234-5678", note: "ดูห้องมุม" };

  it("matches across date formats (form yyyy-MM-dd vs sheet dd/MM/yyyy) with same identity", () => {
    const t = row({ customer: "คุณนก", phone: "0812345678", note: "ดูห้องมุม" });
    expect(findLandedTask([t], pending)).toBe(t);
  });

  it("does not claim another customer's same-day task as ours", () => {
    const other = row({ customer: "คุณแดง", phone: "0899999999", note: "ดูห้องมุม" });
    expect(findLandedTask([other], pending)).toBeNull();
  });

  it("ignores closed twins and mismatched notes", () => {
    const closed = row({ customer: "คุณนก", phone: "0812345678", note: "ดูห้องมุม", status: "เสร็จ" });
    const otherNote = row({ customer: "คุณนก", phone: "0812345678", note: "อื่น" });
    expect(findLandedTask([closed, otherNote], pending)).toBeNull();
  });

  it("a task with no customer at all matches by note only", () => {
    const t = row({ type: "ซ่อม", note: "แอร์ไม่เย็น" });
    expect(findLandedTask([t], { date: "2026-09-11", type: "ซ่อม", building: "มีทอง", room: "204", note: "แอร์ไม่เย็น" })).toBe(t);
    expect(findLandedTask([t], { date: "2026-09-12", type: "ซ่อม", building: "มีทอง", room: "204", note: "แอร์ไม่เย็น" })).toBeNull();
  });
});
