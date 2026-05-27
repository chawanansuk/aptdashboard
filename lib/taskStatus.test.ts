import { describe, expect, it } from "vitest";
import { TASK_STATUS, categorizeStatus, isOpenStatus } from "./taskStatus";

describe("categorizeStatus", () => {
  it("maps blank/undefined/null to pending", () => {
    expect(categorizeStatus("")).toBe("pending");
    expect(categorizeStatus("   ")).toBe("pending");
    expect(categorizeStatus(null)).toBe("pending");
    expect(categorizeStatus(undefined)).toBe("pending");
  });

  it("maps the new engineer statuses", () => {
    expect(categorizeStatus(TASK_STATUS.IN_PROGRESS)).toBe("in_progress");
    expect(categorizeStatus(TASK_STATUS.BLOCKED)).toBe("blocked");
  });

  it("maps done variants (Thai + English + legacy)", () => {
    expect(categorizeStatus("เสร็จ")).toBe("done");
    expect(categorizeStatus("done")).toBe("done");
    expect(categorizeStatus("ปิดแล้ว")).toBe("done");
  });

  it("maps cancelled variants", () => {
    expect(categorizeStatus("ยกเลิก")).toBe("cancelled");
    expect(categorizeStatus("cancelled")).toBe("cancelled");
  });

  it("maps the not-interested viewing outcome as a (lost) cancelled", () => {
    expect(categorizeStatus(TASK_STATUS.NOT_INTERESTED)).toBe("cancelled");
    expect(categorizeStatus("ไม่สนใจ")).toBe("cancelled");
  });

  it("falls back to pending for unknown values (defensive)", () => {
    expect(categorizeStatus("ว่าง")).toBe("pending");
    expect(categorizeStatus("งานใหม่")).toBe("pending");
    expect(categorizeStatus("???")).toBe("pending");
  });
});

describe("isOpenStatus", () => {
  it("treats pending/in-progress/blocked as still actionable", () => {
    expect(isOpenStatus("")).toBe(true);
    expect(isOpenStatus(TASK_STATUS.IN_PROGRESS)).toBe(true);
    expect(isOpenStatus(TASK_STATUS.BLOCKED)).toBe(true);
  });
  it("done and cancelled are NOT open", () => {
    expect(isOpenStatus("เสร็จ")).toBe(false);
    expect(isOpenStatus("ยกเลิก")).toBe(false);
  });
  it("not-interested is NOT open", () => {
    expect(isOpenStatus("ไม่สนใจ")).toBe(false);
  });
});
