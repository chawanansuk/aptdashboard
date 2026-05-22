import { describe, expect, it } from "vitest";
import { relativeTimeLabel } from "./relativeTime";

// Anchor "now" so tests are deterministic
const NOW = new Date("2026-05-22T10:00:00");
function ago(min: number): string {
  const d = new Date(NOW.getTime() - min * 60_000);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

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
    const future = new Date(NOW.getTime() + 5 * 60_000).toISOString().slice(0, 16).replace("T", " ");
    expect(relativeTimeLabel(future, NOW)).toBe("เพิ่งสร้าง");
  });
});
