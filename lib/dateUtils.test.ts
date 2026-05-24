import { describe, it, expect } from "vitest";
import { parseThaiDate, parseSheetDate } from "./dateUtils";

describe("parseThaiDate", () => {
  it("parses DD/MM/YYYY", () => {
    const d = parseThaiDate("25/05/2026");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4); // May (0-indexed)
    expect(d!.getDate()).toBe(25);
  });

  it("parses D/M/YYYY (single-digit day/month)", () => {
    const d = parseThaiDate("5/1/2026");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(5);
  });

  it("parses ISO yyyy-MM-dd (Apps Script Date cell format)", () => {
    // Apps Script's fmtDate_ emits ISO when the sheet cell is a real
    // Date object — task rows added via the API land in this format.
    // Without this case parseThaiDate returned null and downstream
    // overdue/move-in math silently dropped the row.
    const d = parseThaiDate("2026-05-25");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(25);
  });

  it("parses ISO with single-digit month/day", () => {
    const d = parseThaiDate("2026-1-5");
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(5);
  });

  it("rejects out-of-range ISO month", () => {
    expect(parseThaiDate("2026-13-01")).toBeNull();
  });

  it("rejects out-of-range ISO day", () => {
    expect(parseThaiDate("2026-05-32")).toBeNull();
  });

  it("rejects out-of-range ISO year", () => {
    expect(parseThaiDate("1800-05-25")).toBeNull();
    expect(parseThaiDate("2300-05-25")).toBeNull();
  });

  it("returns null for empty / unparseable input", () => {
    expect(parseThaiDate("")).toBeNull();
    expect(parseThaiDate("   ")).toBeNull();
    expect(parseThaiDate("not a date")).toBeNull();
    expect(parseThaiDate("2026/05/25")).toBeNull();
  });
});

describe("parseSheetDate (strict day-in-month)", () => {
  it("parses both ISO and DMY", () => {
    expect(parseSheetDate("2026-05-25")?.getDate()).toBe(25);
    expect(parseSheetDate("25/05/2026")?.getDate()).toBe(25);
    expect(parseSheetDate("25-05-2026")?.getDate()).toBe(25);
    expect(parseSheetDate("25.05.2026")?.getDate()).toBe(25);
  });

  it("rejects out-of-range month/day in either format", () => {
    expect(parseSheetDate("2026-13-01")).toBeNull();
    expect(parseSheetDate("2026-05-32")).toBeNull();
    expect(parseSheetDate("32/05/2026")).toBeNull();
    expect(parseSheetDate("01/13/2026")).toBeNull();
  });

  it("rejects impossible day-in-month (Feb 30, Apr 31)", () => {
    // The previous version let JavaScript's Date constructor silently
    // roll these into the next month — Feb 30 became Mar 2.
    expect(parseSheetDate("2026-02-30")).toBeNull();
    expect(parseSheetDate("2026-04-31")).toBeNull();
    expect(parseSheetDate("30/02/2026")).toBeNull();
  });

  it("accepts leap-year Feb 29", () => {
    expect(parseSheetDate("2028-02-29")?.getDate()).toBe(29);
  });

  it("rejects non-leap-year Feb 29", () => {
    expect(parseSheetDate("2026-02-29")).toBeNull();
  });
});
