import { describe, expect, it } from "vitest";
import { relativeTimeLabel, relativeTimeShort, formatFullTimestamp, parseSheetTimestamp } from "./relativeTime";

// Anchor "now" so tests are deterministic
const NOW = new Date("2026-05-22T10:00:00");
// Format as LOCAL wall-clock "yyyy-MM-dd HH:mm" — matching how
// parseSheetTimestamp interprets the string. (Using toISOString() here
// would emit UTC and make the round-trip off by the runtime's offset,
// so the test passed only under TZ=UTC.)
function fmtLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function ago(min: number): string {
  return fmtLocal(new Date(NOW.getTime() - min * 60_000));
}

describe("relativeTimeShort", () => {
  it("empty / unparseable → empty output", () => {
    expect(relativeTimeShort("", NOW)).toBe("");
    expect(relativeTimeShort(undefined, NOW)).toBe("");
    expect(relativeTimeShort("nope", NOW)).toBe("");
  });
  it("minutes / hours / days / weeks compact forms", () => {
    expect(relativeTimeShort(ago(0), NOW)).toBe("ตอนนี้");
    expect(relativeTimeShort(ago(19), NOW)).toBe("19m");
    expect(relativeTimeShort(ago(60 * 2), NOW)).toBe("2h");
    expect(relativeTimeShort(ago(60 * 24 * 3), NOW)).toBe("3d");
    expect(relativeTimeShort(ago(60 * 24 * 14), NOW)).toBe("2w");
  });
  it("future timestamp (clock skew) → ตอนนี้", () => {
    expect(relativeTimeShort(fmtLocal(new Date(NOW.getTime() + 60_000)), NOW)).toBe("ตอนนี้");
  });
});

describe("formatFullTimestamp", () => {
  it("formats to dd/MM/yyyy HH:mm", () => {
    expect(formatFullTimestamp("2026-05-22 10:30")).toBe("22/05/2026 10:30");
  });
  it("returns raw input when unparseable (better than blank in a title)", () => {
    expect(formatFullTimestamp("garbage")).toBe("garbage");
    expect(formatFullTimestamp(undefined)).toBe("");
  });
});

describe("relativeTimeLabel", () => {
  it("empty input → empty output", () => {
    expect(relativeTimeLabel("", NOW)).toBe("");
    expect(relativeTimeLabel(undefined, NOW)).toBe("");
  });

  it("unparseable input → empty output", () => {
    expect(relativeTimeLabel("not-a-date", NOW)).toBe("");
  });

  it("< 1 min → เพิ่งสร้าง", () => {
    expect(relativeTimeLabel(ago(0), NOW)).toBe("เพิ่งสร้าง");
  });

  it("< 1 hour → minute count", () => {
    expect(relativeTimeLabel(ago(5), NOW)).toBe("5 นาทีที่แล้ว");
    expect(relativeTimeLabel(ago(45), NOW)).toBe("45 นาทีที่แล้ว");
  });

  it("< 1 day → hour count", () => {
    expect(relativeTimeLabel(ago(120), NOW)).toBe("2 ชม.ที่แล้ว");
    expect(relativeTimeLabel(ago(23 * 60), NOW)).toBe("23 ชม.ที่แล้ว");
  });

  it("1 day → เมื่อวาน", () => {
    expect(relativeTimeLabel(ago(24 * 60), NOW)).toBe("เมื่อวาน");
  });

  it("2-6 days → N วันที่แล้ว", () => {
    expect(relativeTimeLabel(ago(3 * 24 * 60), NOW)).toBe("3 วันที่แล้ว");
  });

  it("1-3 weeks → N สัปดาห์ที่แล้ว", () => {
    expect(relativeTimeLabel(ago(14 * 24 * 60), NOW)).toBe("2 สัปดาห์ที่แล้ว");
  });

  it("> 1 month → >1 เดือน", () => {
    expect(relativeTimeLabel(ago(35 * 24 * 60), NOW)).toBe(">1 เดือน");
  });

  it("future timestamp (clock skew) → treats as 'just now'", () => {
    const future = fmtLocal(new Date(NOW.getTime() + 5 * 60_000));
    expect(relativeTimeLabel(future, NOW)).toBe("เพิ่งสร้าง");
  });

  it("handles canonical 'yyyy-MM-dd HH:mm:ss' with seconds", () => {
    expect(relativeTimeLabel("2026-05-22 09:55:30", NOW)).toBe("5 นาทีที่แล้ว");
  });
});

describe("parseSheetTimestamp", () => {
  it("parses canonical 'yyyy-MM-dd HH:mm:ss'", () => {
    const d = parseSheetTimestamp("2026-05-25 10:30:45");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(25);
    expect(d!.getHours()).toBe(10);
    expect(d!.getMinutes()).toBe(30);
  });

  it("parses without seconds", () => {
    const d = parseSheetTimestamp("2026-05-25 10:30");
    expect(d!.getHours()).toBe(10);
    expect(d!.getMinutes()).toBe(30);
  });

  it("parses ISO with T separator", () => {
    const d = parseSheetTimestamp("2026-05-25T10:30:45");
    expect(d!.getDate()).toBe(25);
    expect(d!.getHours()).toBe(10);
  });

  it("parses date-only as midnight", () => {
    const d = parseSheetTimestamp("2026-05-25");
    expect(d!.getDate()).toBe(25);
    expect(d!.getHours()).toBe(0);
  });

  it("recovers a Sheets-coerced JS Date string", () => {
    // The bug: Google Sheets turns the timestamp text into a real Date,
    // read back as this format — used to render blank.
    const d = parseSheetTimestamp("Mon May 25 2026 10:30:45 GMT+0700 (Indochina Time)");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
  });

  it("rejects out-of-range components", () => {
    expect(parseSheetTimestamp("2026-13-01 10:00:00")).toBeNull();
    expect(parseSheetTimestamp("2026-02-30 10:00:00")).toBeNull();
    expect(parseSheetTimestamp("2026-05-25 25:00:00")).toBeNull();
  });

  it("returns null for empty / garbage", () => {
    expect(parseSheetTimestamp("")).toBeNull();
    expect(parseSheetTimestamp(undefined)).toBeNull();
    expect(parseSheetTimestamp("总之不是日期")).toBeNull();
  });
});
