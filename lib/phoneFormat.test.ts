import { describe, expect, it } from "vitest";
import { formatSheetPhone, formatThaiPhone, phoneDigits, sheetPhoneDigits } from "./phoneFormat";

describe("formatThaiPhone", () => {
  it("formats a full mobile number as xxx-xxxxxxx (the LINE format)", () => {
    expect(formatThaiPhone("0924561642")).toBe("092-4561642");
  });

  it("formats progressively while typing", () => {
    expect(formatThaiPhone("0")).toBe("0");
    expect(formatThaiPhone("092")).toBe("092");
    expect(formatThaiPhone("0924")).toBe("092-4");
    expect(formatThaiPhone("092456")).toBe("092-456");
  });

  it("strips non-digits before formatting (paste with dashes/spaces)", () => {
    expect(formatThaiPhone("092-456-1642")).toBe("092-4561642");
    expect(formatThaiPhone(" 092 456 1642 ")).toBe("092-4561642");
  });

  it("empty input stays empty", () => {
    expect(formatThaiPhone("")).toBe("");
  });
});

describe("phoneDigits", () => {
  it("keeps digits only, capped at 10", () => {
    expect(phoneDigits("092-456-1642")).toBe("0924561642");
    expect(phoneDigits("09245616429999")).toBe("0924561642");
    expect(phoneDigits("abc")).toBe("");
  });

  it("normalizes +66 international format back to 0-prefix (audit r12)", () => {
    // Without this, the 10-digit cap ate the LAST digit of +66 numbers.
    expect(phoneDigits("+66 92-456-1642")).toBe("0924561642");
    expect(phoneDigits("+66924561642")).toBe("0924561642");
    // 9-digit landline stays untouched (starts with 0 already)
    expect(phoneDigits("02-123-4567")).toBe("021234567");
  });

  it("round-trips with formatThaiPhone", () => {
    expect(phoneDigits(formatThaiPhone("0924561642"))).toBe("0924561642");
  });
});

describe("sheetPhoneDigits / formatSheetPhone (Sheets eats leading zeros)", () => {
  it("restores the 0 Sheets dropped from a numeric cell", () => {
    // 0624705817 stored as a number comes back as 624705817.
    expect(sheetPhoneDigits("624705817")).toBe("0624705817");
    expect(formatSheetPhone("624705817")).toBe("062-4705817");
    expect(formatSheetPhone("818885555")).toBe("081-8885555");
    expect(formatSheetPhone("934567890")).toBe("093-4567890");
  });

  it("leaves already-correct numbers alone", () => {
    expect(formatSheetPhone("0924561642")).toBe("092-4561642");
    expect(formatSheetPhone("092-456-1642")).toBe("092-4561642");
    expect(sheetPhoneDigits("021234567")).toBe("021234567"); // 9-digit landline starts with 0
  });

  it("does not touch 9-digit numbers that aren't mobile prefixes", () => {
    expect(sheetPhoneDigits("512345678")).toBe("512345678");
  });

  it("handles +66 and empty input", () => {
    expect(formatSheetPhone("+66924561642")).toBe("092-4561642");
    expect(formatSheetPhone("")).toBe("");
  });
});
