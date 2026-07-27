import { describe, expect, it } from "vitest";
import { formatThaiPhone, phoneDigits } from "./phoneFormat";

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
