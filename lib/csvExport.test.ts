import { describe, expect, it } from "vitest";
import { toCsv } from "./csvExport";

interface Row { name: string; n: number; note: string }

const cols = [
  { header: "ชื่อ", value: (r: Row) => r.name },
  { header: "จำนวน", value: (r: Row) => r.n },
  { header: "หมายเหตุ", value: (r: Row) => r.note },
];

describe("toCsv", () => {
  it("emits header + rows joined with newlines", () => {
    const csv = toCsv<Row>(
      [{ name: "A", n: 1, note: "ok" }, { name: "B", n: 2, note: "x" }],
      cols,
    );
    expect(csv.split("\n")).toEqual([
      "ชื่อ,จำนวน,หมายเหตุ",
      "A,1,ok",
      "B,2,x",
    ]);
  });

  it("quotes cells containing commas", () => {
    const csv = toCsv<Row>([{ name: "A,B", n: 1, note: "" }], cols);
    expect(csv).toBe("ชื่อ,จำนวน,หมายเหตุ\n\"A,B\",1,");
  });

  it('escapes double quotes by doubling them', () => {
    const csv = toCsv<Row>([{ name: 'O"K', n: 1, note: "" }], cols);
    // "O""K" — quote whole cell, double inner "
    expect(csv).toBe('ชื่อ,จำนวน,หมายเหตุ\n"O""K",1,');
  });

  it("quotes cells containing newlines", () => {
    const csv = toCsv<Row>([{ name: "a\nb", n: 1, note: "" }], cols);
    expect(csv).toContain('"a\nb"');
  });

  it("preserves Thai characters as-is", () => {
    const csv = toCsv<Row>([{ name: "ห้อง 101", n: 5, note: "ทดสอบ" }], cols);
    expect(csv).toBe("ชื่อ,จำนวน,หมายเหตุ\nห้อง 101,5,ทดสอบ");
  });

  it("renders null/undefined values as empty cells", () => {
    const csv = toCsv<Row>(
      [{ name: "", n: 0, note: "" }],
      [
        { header: "n", value: (r: Row) => r.name || null },
        { header: "x", value: () => undefined },
      ],
    );
    expect(csv).toBe("n,x\n,");
  });

  it("handles empty rows array — header only, trailing newline", () => {
    const csv = toCsv<Row>([], cols);
    expect(csv).toBe("ชื่อ,จำนวน,หมายเหตุ\n");
  });
});
