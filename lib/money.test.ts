import { describe, expect, it } from "vitest";
import { formatBaht, parsePrice, parsePriceOr0 } from "./money";

describe("parsePrice", () => {
  it("returns NaN for empty / null / undefined", () => {
    expect(parsePrice("")).toBeNaN();
    expect(parsePrice(null)).toBeNaN();
    expect(parsePrice(undefined)).toBeNaN();
  });

  it("parses plain digits and comma-grouped strings the same", () => {
    expect(parsePrice("3500")).toBe(3500);
    expect(parsePrice("3,500")).toBe(3500);
    expect(parsePrice("3,500 บาท")).toBe(3500);
    expect(parsePrice(" 3500 ฿")).toBe(3500);
  });

  it("takes the integer part of decimal strings (no 100× inflation)", () => {
    // A pasted "5,500.00" must not become 550000 (the "." + decimals
    // concatenated into the integer). Thai rents are whole baht.
    expect(parsePrice("5,500.00")).toBe(5500);
    expect(parsePrice("3500.50")).toBe(3500);
    expect(parsePrice("12.5")).toBe(12);
  });

  it("passes through finite numbers", () => {
    expect(parsePrice(1234)).toBe(1234);
    expect(parsePrice(0)).toBe(0);
  });

  it("returns NaN when no digits remain", () => {
    expect(parsePrice("abc")).toBeNaN();
    expect(parsePrice("฿")).toBeNaN();
  });

  it("rejects leading-minus strings (no silent sign drop)", () => {
    // Old taskCost.parseCostInput returned 0 for "-100" via parseFloat +
    // >0 guard. Strip-then-parseInt would have silently turned it into
    // +100 — guard explicitly so callers get NaN/0 like before.
    expect(parsePrice("-100")).toBeNaN();
    expect(parsePrice("-1,500 ฿")).toBeNaN();
  });
});

describe("parsePriceOr0", () => {
  it("coerces invalid / NaN / negative to 0", () => {
    expect(parsePriceOr0("")).toBe(0);
    expect(parsePriceOr0("abc")).toBe(0);
    expect(parsePriceOr0(null)).toBe(0);
    expect(parsePriceOr0(-5)).toBe(0);
  });

  it("keeps valid positive values", () => {
    expect(parsePriceOr0("1,200")).toBe(1200);
    expect(parsePriceOr0(800)).toBe(800);
  });
});

describe("formatBaht", () => {
  it("adds Thai grouping + ' ฿' suffix by default", () => {
    expect(formatBaht(1500)).toBe("1,500 ฿");
    expect(formatBaht(1_234_567)).toBe("1,234,567 ฿");
  });

  it("accepts string input by delegating to parsePrice", () => {
    expect(formatBaht("3,500")).toBe("3,500 ฿");
    expect(formatBaht("3500 บาท")).toBe("3,500 ฿");
  });

  it("omits the suffix when {suffix:''}", () => {
    expect(formatBaht(1500, { suffix: "" })).toBe("1,500");
  });

  it("returns '' for 0/NaN/null/negative by default", () => {
    expect(formatBaht(0)).toBe("");
    expect(formatBaht(NaN)).toBe("");
    expect(formatBaht(null)).toBe("");
    expect(formatBaht(-100)).toBe("");
    expect(formatBaht("")).toBe("");
  });

  it("renders 0 when {showZero:true}", () => {
    expect(formatBaht(0, { showZero: true })).toBe("0 ฿");
    expect(formatBaht(0, { showZero: true, suffix: "" })).toBe("0");
  });
});
