import { describe, expect, it } from "vitest";
import { parseImageUrls } from "@/components/RoomImageGallery";

describe("parseImageUrls", () => {
  it("returns [] for empty / undefined", () => {
    expect(parseImageUrls(undefined)).toEqual([]);
    expect(parseImageUrls("")).toEqual([]);
    expect(parseImageUrls("   ")).toEqual([]);
  });

  it("splits on commas and newlines, trimming each", () => {
    expect(parseImageUrls("https://a.com/1.jpg, https://b.com/2.png")).toEqual([
      "https://a.com/1.jpg",
      "https://b.com/2.png",
    ]);
    expect(parseImageUrls("https://a.com/1.jpg\nhttps://b.com/2.png")).toEqual([
      "https://a.com/1.jpg",
      "https://b.com/2.png",
    ]);
  });

  it("drops non-http(s) junk (guards against pasted notes)", () => {
    expect(parseImageUrls("https://ok.com/x.jpg, ไม่ใช่ลิงก์, ftp://nope")).toEqual([
      "https://ok.com/x.jpg",
    ]);
  });

  it("accepts http and https", () => {
    expect(parseImageUrls("http://a.com/x.jpg")).toEqual(["http://a.com/x.jpg"]);
  });
});
