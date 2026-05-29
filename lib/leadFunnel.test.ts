import { describe, expect, it } from "vitest";
import { daysInStage, isStale, computeFunnel, STALE_DAYS } from "./leadFunnel";
import type { Lead } from "@/types";

const NOW = new Date("2026-05-22T10:00:00");
function fmtLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function daysAgo(n: number): string {
  return fmtLocal(new Date(NOW.getTime() - n * 86_400_000));
}
function mk(over: Partial<Lead> = {}): Lead {
  return {
    id: "l1", name: "A", phone: "", source: "LINE", interest: "",
    stage: "กำลังคุย", note: "", creator: "", createdAt: daysAgo(0), updatedAt: daysAgo(0),
    ...over,
  };
}

describe("daysInStage", () => {
  it("counts whole days since updatedAt", () => {
    expect(daysInStage(mk({ updatedAt: daysAgo(3) }), NOW)).toBe(3);
  });
  it("falls back to createdAt when updatedAt missing", () => {
    expect(daysInStage(mk({ updatedAt: "", createdAt: daysAgo(5) }), NOW)).toBe(5);
  });
  it("returns null for unparseable", () => {
    expect(daysInStage(mk({ updatedAt: "", createdAt: "" }), NOW)).toBeNull();
  });
  it("clamps future timestamps to 0 (clock skew)", () => {
    expect(daysInStage(mk({ updatedAt: daysAgo(-2) }), NOW)).toBe(0);
  });
});

describe("isStale", () => {
  it("flags non-terminal leads idle beyond STALE_DAYS", () => {
    expect(isStale(mk({ stage: "กำลังคุย", updatedAt: daysAgo(STALE_DAYS + 1) }), NOW)).toBe(true);
  });
  it("does not flag a fresh lead", () => {
    expect(isStale(mk({ stage: "กำลังคุย", updatedAt: daysAgo(1) }), NOW)).toBe(false);
  });
  it("never flags terminal stages no matter how old", () => {
    expect(isStale(mk({ stage: "ปิดดีล", updatedAt: daysAgo(100) }), NOW)).toBe(false);
    expect(isStale(mk({ stage: "ปิดเลิก", updatedAt: daysAgo(100) }), NOW)).toBe(false);
  });
});

describe("computeFunnel", () => {
  it("counts every stage and orders them by LEAD_STAGES", () => {
    const leads = [
      mk({ stage: "ใหม่" }), mk({ stage: "ใหม่" }),
      mk({ stage: "กำลังคุย" }),
      mk({ stage: "ปิดดีล" }),
    ];
    const f = computeFunnel(leads);
    expect(f[0]).toMatchObject({ stage: "ใหม่", count: 2, conversionFromPrev: null });
    expect(f.find((x) => x.stage === "กำลังคุย")!.count).toBe(1);
    // sum of counts == total leads
    expect(f.reduce((a, b) => a + b.count, 0)).toBe(4);
  });
  it("computes conversion % from the previous stage", () => {
    const leads = [
      mk({ stage: "ใหม่" }), mk({ stage: "ใหม่" }), mk({ stage: "ใหม่" }), mk({ stage: "ใหม่" }), // 4
      mk({ stage: "นัดดูแล้ว" }), mk({ stage: "นัดดูแล้ว" }), // 2 → 50%
    ];
    const f = computeFunnel(leads);
    expect(f[0].conversionFromPrev).toBeNull();
    expect(f[1]).toMatchObject({ stage: "นัดดูแล้ว", count: 2, conversionFromPrev: 50 });
  });
  it("conversion is null when the previous stage is empty", () => {
    const f = computeFunnel([mk({ stage: "กำลังคุย" })]);
    expect(f[1].conversionFromPrev).toBeNull(); // นัดดูแล้ว=0 → กำลังคุย conv null
  });
});
