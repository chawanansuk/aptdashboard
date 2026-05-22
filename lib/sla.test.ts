import { describe, expect, it } from "vitest";
import { computeSla, slaBadgeLabel, getSlaDays, SLA_DAYS_BY_TYPE } from "./sla";

describe("SLA_DAYS_BY_TYPE", () => {
  it("has per-type budgets", () => {
    expect(SLA_DAYS_BY_TYPE["ซ่อม"]).toBe(3);
    expect(SLA_DAYS_BY_TYPE["ทำสะอาด"]).toBe(1);
  });
  it("getSlaDays falls back to 3 for unknown types", () => {
    expect(getSlaDays("xxx")).toBe(3);
  });
});

describe("computeSla", () => {
  const now = new Date(2026, 4, 21); // Thu 21 May 2026

  it("returns 'idle' for done status", () => {
    const r = computeSla({ date: "10/05/2026", type: "ซ่อม", status: "เสร็จ" }, { now });
    expect(r.state).toBe("idle");
  });
  it("returns 'idle' for cancelled status", () => {
    const r = computeSla({ date: "10/05/2026", type: "ซ่อม", status: "ยกเลิก" }, { now });
    expect(r.state).toBe("idle");
  });
  it("returns 'idle' for sales-side types (slaDays=0)", () => {
    const r = computeSla({ date: "10/05/2026", type: "ชมห้อง", status: "" }, { now });
    expect(r.state).toBe("idle");
  });
  it("returns 'future' when task date is ahead of today", () => {
    const r = computeSla({ date: "25/05/2026", type: "ซ่อม", status: "" }, { now });
    expect(r.state).toBe("future");
    expect(r.daysSinceDate).toBeLessThan(0);
  });

  describe("ทำสะอาด (SLA 1 day)", () => {
    it("on the day → 'ok'", () => {
      const r = computeSla({ date: "21/05/2026", type: "ทำสะอาด", status: "" }, { now });
      expect(r.state).toBe("ok");
      expect(r.daysSinceDate).toBe(0);
    });
    it("1 day past (= full SLA used) → 'overdue'", () => {
      const r = computeSla({ date: "20/05/2026", type: "ทำสะอาด", status: "" }, { now });
      expect(r.state).toBe("overdue");
      expect(r.daysOverSla).toBe(0);
    });
    it("3 days past → 'overdue' with daysOver=2", () => {
      const r = computeSla({ date: "18/05/2026", type: "ทำสะอาด", status: "" }, { now });
      expect(r.state).toBe("overdue");
      expect(r.daysOverSla).toBe(2);
    });
  });

  describe("ซ่อม (SLA 3 days)", () => {
    it("0 days → 'ok'", () => {
      const r = computeSla({ date: "21/05/2026", type: "ซ่อม", status: "" }, { now });
      expect(r.state).toBe("ok");
    });
    it("1 day → 'ok' (under 50% of SLA=3)", () => {
      const r = computeSla({ date: "20/05/2026", type: "ซ่อม", status: "" }, { now });
      expect(r.state).toBe("ok");
    });
    it("2 days → 'warn' (50%+ of SLA)", () => {
      const r = computeSla({ date: "19/05/2026", type: "ซ่อม", status: "" }, { now });
      expect(r.state).toBe("warn");
    });
    it("3 days → 'overdue'", () => {
      const r = computeSla({ date: "18/05/2026", type: "ซ่อม", status: "" }, { now });
      expect(r.state).toBe("overdue");
    });
    it("5 days → 'overdue' daysOver=2", () => {
      const r = computeSla({ date: "16/05/2026", type: "ซ่อม", status: "" }, { now });
      expect(r.state).toBe("overdue");
      expect(r.daysOverSla).toBe(2);
    });
  });

  it("returns 'idle' for unparseable date", () => {
    const r = computeSla({ date: "garbage", type: "ซ่อม", status: "" }, { now });
    expect(r.state).toBe("idle");
  });
});

describe("slaBadgeLabel", () => {
  const now = new Date(2026, 4, 21);
  it("renders nothing for non-overdue states", () => {
    expect(slaBadgeLabel(computeSla({ date: "21/05/2026", type: "ซ่อม", status: "" }, { now }))).toBe("");
    expect(slaBadgeLabel(computeSla({ date: "25/05/2026", type: "ซ่อม", status: "" }, { now }))).toBe("");
  });
  it("says 'ครบกำหนดวันนี้' when daysOver=0", () => {
    const r = computeSla({ date: "20/05/2026", type: "ทำสะอาด", status: "" }, { now });
    expect(slaBadgeLabel(r)).toBe("ครบกำหนดวันนี้");
  });
  it("says 'ครบกำหนดวันนี้' when daysOverSla=0 (exact SLA boundary)", () => {
    const r = computeSla({ date: "18/05/2026", type: "ซ่อม", status: "" }, { now });
    expect(slaBadgeLabel(r)).toBe("ครบกำหนดวันนี้"); // 18→21 is 3 days, SLA=3 → daysOverSla=0
  });
  it("includes days-over count for actual overdue", () => {
    const r2 = computeSla({ date: "16/05/2026", type: "ซ่อม", status: "" }, { now });
    expect(slaBadgeLabel(r2)).toBe("เกิน SLA 2 วัน");
  });
});
