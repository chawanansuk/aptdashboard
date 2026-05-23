import { describe, expect, it } from "vitest";
import {
  COMMON_AREA_PREFIX,
  COMMON_AREA_TYPES,
  isCommonAreaTask,
  parseTaskLocation,
  formatCommonArea,
  filterTasksByLocation,
} from "./taskLocation";

describe("isCommonAreaTask", () => {
  it("true when room starts with prefix", () => {
    expect(isCommonAreaTask({ room: "ส่วนกลาง:ลิฟต์" })).toBe(true);
  });
  it("false for regular room number", () => {
    expect(isCommonAreaTask({ room: "101" })).toBe(false);
    expect(isCommonAreaTask({ room: "1.1" })).toBe(false);
  });
  it("false for empty room", () => {
    expect(isCommonAreaTask({ room: "" })).toBe(false);
  });
});

describe("parseTaskLocation", () => {
  it("returns 'common' kind + stripped label for common area", () => {
    const out = parseTaskLocation({ room: "ส่วนกลาง:ลิฟต์" });
    expect(out.kind).toBe("common");
    expect(out.label).toBe("ลิฟต์");
    expect(out.raw).toBe("ส่วนกลาง:ลิฟต์");
  });
  it("returns 'room' kind + 'ห้อง N' label for regular room", () => {
    const out = parseTaskLocation({ room: "205" });
    expect(out.kind).toBe("room");
    expect(out.label).toBe("ห้อง 205");
  });
});

describe("formatCommonArea", () => {
  it("composes prefix + type", () => {
    expect(formatCommonArea("ลิฟต์")).toBe("ส่วนกลาง:ลิฟต์");
    expect(formatCommonArea("สระว่ายน้ำ")).toBe("ส่วนกลาง:สระว่ายน้ำ");
  });
  it("output round-trips through parseTaskLocation", () => {
    const encoded = formatCommonArea("ปั๊มน้ำ");
    const parsed = parseTaskLocation({ room: encoded });
    expect(parsed.kind).toBe("common");
    expect(parsed.label).toBe("ปั๊มน้ำ");
  });
});

describe("filterTasksByLocation", () => {
  const tasks = [
    { room: "101" },
    { room: "ส่วนกลาง:ลิฟต์" },
    { room: "205" },
    { room: "ส่วนกลาง:สระว่ายน้ำ" },
  ];
  it("'all' returns everything", () => {
    expect(filterTasksByLocation(tasks, "all")).toHaveLength(4);
  });
  it("'room' filters out common areas", () => {
    const out = filterTasksByLocation(tasks, "room");
    expect(out).toHaveLength(2);
    expect(out.every((t) => !t.room.startsWith("ส่วนกลาง:"))).toBe(true);
  });
  it("'common' filters out tenant rooms", () => {
    const out = filterTasksByLocation(tasks, "common");
    expect(out).toHaveLength(2);
    expect(out.every((t) => t.room.startsWith("ส่วนกลาง:"))).toBe(true);
  });
});

describe("COMMON_AREA_TYPES", () => {
  it("includes core area entries", () => {
    expect(COMMON_AREA_TYPES).toContain("ทางเดิน");
    expect(COMMON_AREA_TYPES).toContain("ลิฟต์");
    expect(COMMON_AREA_TYPES).toContain("ปั๊มน้ำ");
  });
  it("includes issue-oriented types (post 2026-05 refresh)", () => {
    expect(COMMON_AREA_TYPES).toContain("ไฟแสงสว่าง");
    expect(COMMON_AREA_TYPES).toContain("น้ำรั่ว");
    expect(COMMON_AREA_TYPES).toContain("น้ำท่วมขัง");
    expect(COMMON_AREA_TYPES).toContain("ท่อตัน");
    expect(COMMON_AREA_TYPES).toContain("ต้นไม้");
    expect(COMMON_AREA_TYPES).toContain("หลังคา");
  });
  it("uses Thai-readable labels for network + camera", () => {
    expect(COMMON_AREA_TYPES).toContain("อินเตอร์เน็ต");
    expect(COMMON_AREA_TYPES).toContain("กล้องวงจรปิด");
  });
  it("ends with 'อื่นๆ' fallback", () => {
    expect(COMMON_AREA_TYPES[COMMON_AREA_TYPES.length - 1]).toBe("อื่นๆ");
  });
});

describe("COMMON_AREA_PREFIX constant", () => {
  it("matches the format used by formatCommonArea", () => {
    expect(formatCommonArea("X").startsWith(COMMON_AREA_PREFIX)).toBe(true);
  });
});
