import { describe, expect, it } from "vitest";
import { bestMatch, normalizeName, similarity, tokens, unitPriceOf } from "./receiptMatch";

const PARTS = [
  { id: "p-tissue", name: "ทิชชู่ม้วนใหญ่ สก็อตต์" },
  { id: "p-floor", name: "น้ำยาถูพื้น 5 ลิตร" },
  { id: "p-led", name: "หลอดไฟ LED 9W" },
  { id: "p-bag", name: "ถุงขยะดำ 30x40" },
];

describe("normalizeName / tokens", () => {
  it("strips tone marks, symbols and case", () => {
    expect(normalizeName("ทิชชู่ (SCOTT) 24R!")).toBe("ทิชชู scott 24r");
    expect(tokens("น้ำยาถูพื้น 5 ลิตร")).toEqual(["นำยาถูพืน", "ลิตร"]);
  });
});

describe("similarity", () => {
  it("exact / substring / token overlap tiers", () => {
    expect(similarity("ทิชชู่ม้วนใหญ่ สก็อตต์", "ทิชชู่ม้วนใหญ่ สก็อตต์")).toBe(1);
    expect(similarity("SCOTT ทิชชู่ม้วนใหญ่ 24 ม้วน", "ทิชชู่ม้วนใหญ่")).toBeGreaterThanOrEqual(0.9);
    expect(similarity("น้ำยาถูพื้น มาจิคลีน 5L", "น้ำยาถูพื้น 5 ลิตร")).toBeGreaterThan(0.4);
    expect(similarity("กาแฟ 3in1", "หลอดไฟ LED 9W")).toBe(0);
  });
});

describe("bestMatch", () => {
  it("picks the closest part above the threshold", () => {
    const m = bestMatch({ name: "SCOTT ทิชชู่ม้วนใหญ่ 24R", quantity: 2, totalPrice: 378 }, PARTS);
    expect(m?.partId).toBe("p-tissue");
  });
  it("returns null for unknown items instead of guessing", () => {
    expect(bestMatch({ name: "กาแฟเนสกาแฟ 3in1", quantity: 1, totalPrice: 120 }, PARTS)).toBeNull();
  });
  it("LED bulb matches by latin token", () => {
    expect(bestMatch({ name: "PHILIPS LED BULB 9W E27", quantity: 10, totalPrice: 590 }, PARTS)?.partId).toBe("p-led");
  });
});

describe("unitPriceOf", () => {
  it("divides and rounds to satang; 0 when unknown", () => {
    expect(unitPriceOf({ name: "x", quantity: 3, totalPrice: 100 })).toBe(33.33);
    expect(unitPriceOf({ name: "x", quantity: 0, totalPrice: 100 })).toBe(0);
  });
});
