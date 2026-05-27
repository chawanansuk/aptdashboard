import { describe, expect, it } from "vitest";
import {
  normalizePhone,
  findLeadByPhone,
  nextStageOnViewingClosed,
  STAGE_ON_VIEWING_SCHEDULED,
} from "./leadLink";
import type { Lead } from "@/types";

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "L1", name: "สมชาย", phone: "081-234-5678", source: "อื่นๆ",
    interest: "", stage: "นัดดูแล้ว", note: "", creator: "", createdAt: "", updatedAt: "",
    ...over,
  };
}

describe("normalizePhone", () => {
  it("strips spaces, dashes and any non-digits", () => {
    expect(normalizePhone("081-234-5678")).toBe("0812345678");
    expect(normalizePhone(" 08 1234 5678 ")).toBe("0812345678");
    expect(normalizePhone("(081) 234-5678")).toBe("0812345678");
  });
  it("returns empty for blank/nullish", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
  });
});

describe("findLeadByPhone", () => {
  const leads = [lead({ id: "A", phone: "081-234-5678" }), lead({ id: "B", phone: "0899999999" })];
  it("matches regardless of formatting", () => {
    expect(findLeadByPhone(leads, "0812345678")?.id).toBe("A");
    expect(findLeadByPhone(leads, "081 234 5678")?.id).toBe("A");
  });
  it("returns undefined for no match or empty phone", () => {
    expect(findLeadByPhone(leads, "0000000000")).toBeUndefined();
    expect(findLeadByPhone(leads, "")).toBeUndefined();
    expect(findLeadByPhone([], "0812345678")).toBeUndefined();
  });
});

describe("nextStageOnViewingClosed", () => {
  it("STAGE_ON_VIEWING_SCHEDULED is the scheduled-viewing stage", () => {
    expect(STAGE_ON_VIEWING_SCHEDULED).toBe("นัดดูแล้ว");
  });

  it("'เสร็จ' (viewed) advances early stages to กำลังคุย", () => {
    expect(nextStageOnViewingClosed("ใหม่", "เสร็จ")).toBe("กำลังคุย");
    expect(nextStageOnViewingClosed("นัดดูแล้ว", "เสร็จ")).toBe("กำลังคุย");
  });
  it("'เสร็จ' never regresses a lead already further along", () => {
    expect(nextStageOnViewingClosed("กำลังคุย", "เสร็จ")).toBeNull();
    expect(nextStageOnViewingClosed("ทำสัญญา", "เสร็จ")).toBeNull();
    expect(nextStageOnViewingClosed("ปิดดีล", "เสร็จ")).toBeNull();
  });

  it("'ไม่สนใจ' marks the lead lost (ปิดเลิก)", () => {
    expect(nextStageOnViewingClosed("ใหม่", "ไม่สนใจ")).toBe("ปิดเลิก");
    expect(nextStageOnViewingClosed("นัดดูแล้ว", "ไม่สนใจ")).toBe("ปิดเลิก");
    expect(nextStageOnViewingClosed("กำลังคุย", "ไม่สนใจ")).toBe("ปิดเลิก");
  });
  it("'ไม่สนใจ' does NOT override a won/signing deal, nor re-mark an already-lost one", () => {
    expect(nextStageOnViewingClosed("ทำสัญญา", "ไม่สนใจ")).toBeNull();
    expect(nextStageOnViewingClosed("ปิดดีล", "ไม่สนใจ")).toBeNull();
    expect(nextStageOnViewingClosed("ปิดเลิก", "ไม่สนใจ")).toBeNull();
  });

  it("'ยกเลิก' or other statuses leave the lead untouched", () => {
    expect(nextStageOnViewingClosed("นัดดูแล้ว", "ยกเลิก")).toBeNull();
    expect(nextStageOnViewingClosed("ใหม่", "")).toBeNull();
    expect(nextStageOnViewingClosed("ใหม่", "กำลังทำ")).toBeNull();
  });
});
