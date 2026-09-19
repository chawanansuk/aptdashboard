import { describe, expect, it } from "vitest";
import { makeEtag, timing } from "./apiTiming";

/**
 * r37 — regression: log production มี TypeError "Cannot convert argument to a
 * ByteString ... value of 3627" 50 ครั้งใน 7 วัน (ผู้ใช้ 6 คน) ที่
 * /api/dashboard/tasks และ /api/maintenance-plan.
 *
 * ต้นเหตุ: ตั้งแต่ r27 ข้อความ error ของ Apps Script เป็นภาษาไทย แล้วถูกส่ง
 * ต่อเป็น `desc` ของ Server-Timing header. HTTP header เป็น ByteString (latin1)
 * ตัวอักษรไทยเกิน U+00FF → NextResponse.json โยน error → 500 ทั้งที่ body
 * เป็นข้อมูลเก่าที่ใช้ได้ (emergency-stale) ระบบ "ล่มแล้วใช้ของเก่าต่อ" จึง
 * ไม่เคยทำงานเลย.
 */

/** จำลองด่านที่พังจริง: undici ตรวจ header ว่าเป็น ByteString ได้ไหม */
function isHeaderSafe(v: string): boolean {
  try {
    new Headers({ "Server-Timing": v });
    return true;
  } catch {
    return false;
  }
}

describe("timing — Server-Timing header safety (r37)", () => {
  it("ข้อความไทยใน desc ต้องไม่ทำให้ header พัง", () => {
    const v = timing("fetch", 16905, "failed: หลังบ้าน Google ตอบช้าเกินไป — กดลองอีกครั้งได้เลย");
    expect(isHeaderSafe(v)).toBe(true);
    expect(v).toMatch(/^fetch;desc="failed: \?+/);
    expect(v).toContain("dur=16905");
  });

  it("ชื่อ metric ที่ไม่ใช่ ASCII ก็ต้องปลอดภัย", () => {
    expect(isHeaderSafe(timing("ดึงข้อมูล", 12))).toBe(true);
  });

  it("emoji / อักขระควบคุม ไม่หลุดเข้า header", () => {
    const v = timing("fetch", 1, "boom 💥\nsecond line");
    expect(isHeaderSafe(v)).toBe(true);
    expect(v).not.toContain("\n");
    expect(v).not.toContain("💥");
  });

  it("ASCII ปกติยังเหมือนเดิม + quote ถูกลดเป็น single quote", () => {
    expect(timing("cache", 0, "fresh hit")).toBe('cache;desc="fresh hit";dur=0');
    expect(timing("x", 5, 'say "hi"')).toBe(`x;desc="say 'hi'";dur=5`);
    expect(timing("total", 1234.7)).toBe("total;dur=1235");
  });
});

describe("makeEtag", () => {
  it("ค่าเท่ากัน → etag เท่ากัน, ต่างกัน → ต่างกัน", () => {
    const rows = [{ a: 1 }];
    expect(makeEtag("tasks", rows)).toBe(makeEtag("tasks", rows));
    expect(makeEtag("tasks", rows)).not.toBe(makeEtag("tasks", [{ a: 2 }]));
  });

  it("prefix แยก namespace กันชนกันข้าม route", () => {
    expect(makeEtag("tasks", [1])).not.toBe(makeEtag("rooms", [1]));
  });

  it("สถานะ degraded ที่ fold เข้า etag ทำให้ 304 ไม่กลบ emergency-stale (r34)", () => {
    const rows = [{ a: 1 }];
    expect(makeEtag("tasks", rows)).not.toBe(makeEtag("tasks", { state: "emergency-stale", rows }));
  });
});
