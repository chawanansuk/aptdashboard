import { describe, expect, it } from "vitest";
import { cleanParsedTask, resolveBuilding } from "./taskParse";

const BUILDINGS = ["มีทอง", "มั่งมี", "มายทรี48", "KL", "บ้านมีทรัพย์"];
const ROOMS = [
  { building: "มีทอง", room: "204" },
  { building: "KL", room: "101" },
];

describe("resolveBuilding", () => {
  it("exact, case-insensitive, and partial both ways", () => {
    expect(resolveBuilding("มีทอง", BUILDINGS)).toBe("มีทอง");
    expect(resolveBuilding("kl", BUILDINGS)).toBe("KL");
    expect(resolveBuilding("มายทรี", BUILDINGS)).toBe("มายทรี48");
    expect(resolveBuilding("ตึกมีทรัพย์", BUILDINGS)).toBe("บ้านมีทรัพย์");
    expect(resolveBuilding("ตึกที่ไม่มี", BUILDINGS)).toBe("");
  });
});

describe("cleanParsedTask", () => {
  const ctx = { today: "2026-09-05", buildings: BUILDINGS, rooms: ROOMS };
  const base = { type: "ซ่อม", building: "มีทอง", room: "204", date: "2026-09-06", time: "13:00", customer: "คุณนก", phone: "081-234-5678", note: "แอร์ไม่เย็น", unsure: [] as string[] };

  it("passes a clean parse through, normalising the phone", () => {
    const c = cleanParsedTask(base, ctx);
    expect(c).toMatchObject({ type: "ซ่อม", building: "มีทอง", room: "204", date: "2026-09-06", time: "13:00", phone: "0812345678" });
    expect(c.unsure).toEqual([]);
  });

  it("falls back to อื่นๆ + today and flags them when the model returns junk", () => {
    const c = cleanParsedTask({ ...base, type: "ล้างรถ", date: "พรุ่งนี้", time: "บ่าย" }, ctx);
    expect(c.type).toBe("อื่นๆ");
    expect(c.date).toBe("2026-09-05");
    expect(c.time).toBe("");
    expect(c.unsure).toEqual(expect.arrayContaining(["type", "date"]));
  });

  it("flags an unknown building and a room that does not exist in that building", () => {
    const c1 = cleanParsedTask({ ...base, building: "ตึกปลอม" }, ctx);
    expect(c1.building).toBe("");
    expect(c1.unsure).toContain("building");
    const c2 = cleanParsedTask({ ...base, room: "999" }, ctx);
    expect(c2.unsure).toContain("room");
  });

  it("keeps the model's own unsure flags", () => {
    const c = cleanParsedTask({ ...base, unsure: ["customer"] }, ctx);
    expect(c.unsure).toContain("customer");
  });
});
