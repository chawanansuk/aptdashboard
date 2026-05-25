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

  it("neutralizes spreadsheet formula-injection cells", () => {
    const csv = toCsv<Row>(
      [
        { name: "=1+1", n: 1, note: "@SUM(A1)" },
        { name: "+49", n: 2, note: "-5" },
      ],
      cols,
    );
    const lines = csv.split("\n");
    // Leading = + - @ get a ' prefix so they aren't executed as formulas.
    expect(lines[1]).toBe("'=1+1,1,'@SUM(A1)");
    expect(lines[2]).toBe("'+49,2,'-5");
  });

  it("does not prefix safe values (digits, Thai, words)", () => {
    const csv = toCsv<Row>([{ name: "081-234", n: 100, note: "ok" }], cols);
    // "081-234" starts with a digit, not a formula char → untouched.
    expect(csv).toBe("ชื่อ,จำนวน,หมายเหตุ\n081-234,100,ok");
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
