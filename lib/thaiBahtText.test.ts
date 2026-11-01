import { describe, expect, it } from "vitest";
import { thaiBahtText, thaiNumberText } from "./thaiBahtText";

describe("thaiBahtText (BAHTTEXT conventions)", () => {
  it.each([
    [0, "ศูนย์บาทถ้วน"],
    [1, "หนึ่งบาทถ้วน"],
    [10, "สิบบาทถ้วน"],
    [11, "สิบเอ็ดบาทถ้วน"],
    [20, "ยี่สิบบาทถ้วน"],
    [21, "ยี่สิบเอ็ดบาทถ้วน"],
    [101, "หนึ่งร้อยเอ็ดบาทถ้วน"],
    [5200, "ห้าพันสองร้อยบาทถ้วน"],
    [10000, "หนึ่งหมื่นบาทถ้วน"],
    [15535, "หนึ่งหมื่นห้าพันห้าร้อยสามสิบห้าบาทถ้วน"],
    [1_000_000, "หนึ่งล้านบาทถ้วน"],
    [2_000_001, "สองล้านเอ็ดบาทถ้วน"],
    [11_250_000, "สิบเอ็ดล้านสองแสนห้าหมื่นบาทถ้วน"],
  ])("%d → %s", (n, words) => {
    expect(thaiBahtText(n)).toBe(words);
  });

  it("satang", () => {
    expect(thaiBahtText(10335.5)).toBe("หนึ่งหมื่นสามร้อยสามสิบห้าบาทห้าสิบสตางค์");
    expect(thaiBahtText(0.25)).toBe("ยี่สิบห้าสตางค์");
    expect(thaiBahtText(99.999)).toBe("หนึ่งร้อยบาทถ้วน"); // rounds up to the next baht
  });

  it("nothing for nonsense", () => {
    expect(thaiBahtText(-5)).toBe("");
    expect(thaiBahtText(Number.NaN)).toBe("");
    expect(thaiNumberText(-1)).toBe("");
  });
});
