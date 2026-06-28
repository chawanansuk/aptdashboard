import { describe, expect, it } from "vitest";
import { appendRepairLog, parseRepairLog, hasRepairLog } from "./repairLog";

const JUN28 = new Date(2026, 5, 28);
const JUL2 = new Date(2026, 6, 2);

describe("appendRepairLog", () => {
  it("appends a timestamped line, keeping the original problem", () => {
    const out = appendRepairLog("แอร์ไม่เย็น", "เติมน้ำยา ล้างคอยล์", JUN28);
    expect(out).toBe("แอร์ไม่เย็น\n🔧 [28/06] เติมน้ำยา ล้างคอยล์");
  });

  it("stacks multiple entries oldest-first", () => {
    let n = "แอร์ไม่เย็น";
    n = appendRepairLog(n, "เติมน้ำยา", JUN28);
    n = appendRepairLog(n, "เปลี่ยนคอมเพรสเซอร์", JUL2);
    expect(n).toBe(
      "แอร์ไม่เย็น\n🔧 [28/06] เติมน้ำยา\n🔧 [02/07] เปลี่ยนคอมเพรสเซอร์",
    );
  });

  it("handles an empty starting note", () => {
    expect(appendRepairLog("", "ทาสีใหม่", JUN28)).toBe("🔧 [28/06] ทาสีใหม่");
  });

  it("returns the note unchanged when resolution is blank/whitespace", () => {
    expect(appendRepairLog("แอร์เสีย", "   ", JUN28)).toBe("แอร์เสีย");
    expect(appendRepairLog("แอร์เสีย", "", JUN28)).toBe("แอร์เสีย");
  });

  it("flattens a multi-line resolution into one entry line", () => {
    const out = appendRepairLog("", "เติมน้ำยา\nล้างคอยล์", JUN28);
    expect(out).toBe("🔧 [28/06] เติมน้ำยา ล้างคอยล์");
    // and it parses back as a SINGLE entry
    expect(parseRepairLog(out).entries).toHaveLength(1);
  });

  it("caps length by dropping the oldest log line, never the problem", () => {
    let n = "P".repeat(60); // problem block
    for (let i = 0; i < 40; i++) n = appendRepairLog(n, "X".repeat(30), JUN28);
    expect(n.length).toBeLessThanOrEqual(500);
    expect(n.startsWith("P".repeat(60))).toBe(true); // problem survived
  });
});

describe("parseRepairLog", () => {
  it("splits problem from entries", () => {
    const note = "แอร์ไม่เย็น\n🔧 [28/06] เติมน้ำยา\n🔧 [02/07] เปลี่ยนคอม";
    const p = parseRepairLog(note);
    expect(p.problem).toBe("แอร์ไม่เย็น");
    expect(p.entries).toEqual([
      { date: "28/06", text: "เติมน้ำยา" },
      { date: "02/07", text: "เปลี่ยนคอม" },
    ]);
  });

  it("a note with no markers is all problem, no entries", () => {
    const p = parseRepairLog("เปลี่ยนหลอดไฟ ชั้น 2");
    expect(p.problem).toBe("เปลี่ยนหลอดไฟ ชั้น 2");
    expect(p.entries).toHaveLength(0);
  });

  it("does not mistake a problem line that mentions a date", () => {
    // No 🔧 marker → stays in problem, not parsed as an entry.
    const p = parseRepairLog("นัดช่างวันที่ [28/06] มาดู");
    expect(p.entries).toHaveLength(0);
    expect(p.problem).toContain("28/06");
  });

  it("handles undefined / empty", () => {
    expect(parseRepairLog(undefined)).toEqual({ problem: "", entries: [] });
    expect(parseRepairLog("")).toEqual({ problem: "", entries: [] });
  });
});

describe("hasRepairLog", () => {
  it("true only when a real entry line exists", () => {
    expect(hasRepairLog("แอร์เสีย\n🔧 [28/06] ซ่อมแล้ว")).toBe(true);
    expect(hasRepairLog("แอร์เสีย")).toBe(false);
    expect(hasRepairLog("")).toBe(false);
    expect(hasRepairLog(undefined)).toBe(false);
  });
});
