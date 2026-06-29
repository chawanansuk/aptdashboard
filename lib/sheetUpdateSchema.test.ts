import { describe, expect, it } from "vitest";
import { SheetUpdateBodySchema, formatSheetUpdateError } from "./sheetUpdateSchema";

function parse(raw: unknown) {
  return SheetUpdateBodySchema.safeParse(raw);
}

describe("SheetUpdateBodySchema — discriminated union", () => {
  describe("addTask", () => {
    it("accepts the minimum required shape", () => {
      const r = parse({
        action: "addTask",
        date: "10/06/2026",
        type: "ซ่อม",
        building: "Kl",
        room: "101",
      });
      expect(r.success).toBe(true);
    });

    it("accepts optional customer/phone/note/cost", () => {
      const r = parse({
        action: "addTask",
        date: "10/06/2026",
        type: "ทำสะอาด",
        building: "Kl",
        room: "101",
        customer: "คุณสมชาย",
        phone: "0812345678",
        note: "ตามนัด",
        cost: 1500,
      });
      expect(r.success).toBe(true);
    });

    it("accepts an optional initial status (e.g. file an already-done repair)", () => {
      const r = parse({
        action: "addTask",
        date: "10/06/2026",
        type: "ซ่อม",
        building: "Kl",
        room: "101",
        note: "ก๊อกอ่างล้างหน้า / ลอกท่อน้ำทิ้ง",
        status: "เสร็จ",
      });
      expect(r.success).toBe(true);
      if (r.success && r.data.action === "addTask") {
        expect(r.data.status).toBe("เสร็จ");
      }
    });

    it("rejects missing date with a Thai-friendly message", () => {
      const r = parse({ action: "addTask", type: "ซ่อม", building: "Kl", room: "101" });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(formatSheetUpdateError(r.error)).toMatch(/date/);
      }
    });

    it("rejects an unknown task type", () => {
      const r = parse({
        action: "addTask",
        date: "10/06/2026",
        type: "ไม่รู้",
        building: "Kl",
        room: "101",
      });
      expect(r.success).toBe(false);
    });

    it("rejects negative cost", () => {
      const r = parse({
        action: "addTask",
        date: "10/06/2026",
        type: "ซ่อม",
        building: "Kl",
        room: "101",
        cost: -100,
      });
      expect(r.success).toBe(false);
    });

    it("strips unknown fields (a stale client can't poison the row)", () => {
      const r = parse({
        action: "addTask",
        date: "10/06/2026",
        type: "ซ่อม",
        building: "Kl",
        room: "101",
        legacyDeprecatedColumn: "junk",
        creator: "spoofed@example.com",
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data).not.toHaveProperty("legacyDeprecatedColumn");
        expect(r.data).not.toHaveProperty("creator"); // server stamps from session
      }
    });
  });

  describe("updateTaskStatus", () => {
    it("accepts the 4-tuple + status (legacy shape)", () => {
      const r = parse({
        action: "updateTaskStatus",
        date: "10/06/2026",
        type: "ซ่อม",
        building: "Kl",
        room: "101",
        status: "กำลังทำ",
      });
      expect(r.success).toBe(true);
    });

    it("allows blank status — caller may want to revert to pending", () => {
      const r = parse({
        action: "updateTaskStatus",
        date: "10/06/2026",
        type: "ซ่อม",
        building: "Kl",
        room: "101",
        status: "",
      });
      expect(r.success).toBe(true);
    });
  });

  describe("deleteTask", () => {
    it("accepts the `match` object form", () => {
      const r = parse({
        action: "deleteTask",
        match: { date: "10/06/2026", type: "ซ่อม", building: "Kl", room: "101" },
      });
      expect(r.success).toBe(true);
    });

    it("accepts the inline 4-tuple form", () => {
      const r = parse({
        action: "deleteTask",
        date: "10/06/2026",
        type: "ซ่อม",
        building: "Kl",
        room: "101",
      });
      expect(r.success).toBe(true);
    });

    it("rejects an empty payload — can't blank a row by mistake", () => {
      const r = parse({ action: "deleteTask" });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(formatSheetUpdateError(r.error)).toMatch(/match|date/);
      }
    });
  });

  describe("updateRoomStatus", () => {
    it("accepts the minimum required shape", () => {
      const r = parse({
        action: "updateRoomStatus",
        building: "Kl",
        room: "101",
        status: "ว่าง",
      });
      expect(r.success).toBe(true);
    });

    it("accepts all optional room fields", () => {
      const r = parse({
        action: "updateRoomStatus",
        building: "Kl",
        room: "101",
        status: "มีคนอยู่",
        tenant: "คุณก",
        phone: "0801112222",
        price: "5500",
        contractEnd: "31/12/2026",
        note: "หมายเหตุ",
        images: "https://...,https://...",
        rawStatus: "มีคนอยู่",
      });
      expect(r.success).toBe(true);
    });
  });

  describe("debugFindTask", () => {
    it("accepts the 4-tuple", () => {
      const r = parse({
        action: "debugFindTask",
        date: "10/06/2026",
        type: "ซ่อม",
        building: "Kl",
        room: "101",
      });
      expect(r.success).toBe(true);
    });
  });

  describe("unknown actions", () => {
    it("rejects an unknown action (no silent fall-through)", () => {
      const r = parse({ action: "evilAction", what: "ever" });
      expect(r.success).toBe(false);
    });

    it("rejects a missing action", () => {
      const r = parse({ date: "10/06/2026" });
      expect(r.success).toBe(false);
    });
  });
});

describe("formatSheetUpdateError", () => {
  it("prefixes the field path so the user can find the issue", () => {
    const r = parse({ action: "addTask", type: "ซ่อม", building: "Kl", room: "101" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(formatSheetUpdateError(r.error)).toMatch(/^date:/);
    }
  });
});
