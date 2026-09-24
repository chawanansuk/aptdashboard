import { describe, expect, it } from "vitest";
import { asSheetText, neutralizeFormulas } from "./sheetText";

describe("asSheetText", () => {
  it("turns anything Sheets would parse as a formula into text", () => {
    expect(asSheetText("=TEXTJOIN(\" | \",TRUE,ห้อง!E2:F400)")).toBe("'=TEXTJOIN(\" | \",TRUE,ห้อง!E2:F400)");
    expect(asSheetText("+ห้อง!E5")).toBe("'+ห้อง!E5");
    expect(asSheetText("-แอร์ไม่เย็น")).toBe("'-แอร์ไม่เย็น");
    expect(asSheetText("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("leaves ordinary text and plain numbers alone", () => {
    for (const v of ["คุณเอ เข้า 1 ต.ค.", "", "0812345678", "-3", "+66 81 234 5678", "1,250.50", "a=b"]) {
      expect(asSheetText(v)).toBe(v);
    }
  });
});

describe("neutralizeFormulas", () => {
  it("walks nested objects/arrays but never touches row identity (id, match*)", () => {
    const out = neutralizeFormulas({
      note: "=ห้อง!E5",
      items: [{ name: "=1+1", qty: 2 }],
      id: "=keep",
      matchNote: "=keep",
      match: { date: "=keep" },
      cost: -5,
      done: true,
    });
    expect(out).toEqual({
      note: "'=ห้อง!E5",
      items: [{ name: "'=1+1", qty: 2 }],
      id: "=keep",
      matchNote: "=keep",
      match: { date: "=keep" },
      cost: -5,
      done: true,
    });
  });
});
